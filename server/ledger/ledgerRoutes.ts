/**
 * /api/ledger/* : the built-in system of record for organizations without an external ERP.
 * Reads need erp_connections.read (every role has it); writes need an operating role.
 */
import type { Express, RequestHandler, Response, NextFunction } from "express";
import { storage } from "../storage";
import { ledgerStorage, num } from "./ledgerStorage";
import { parseCsv, toCsv, parseDate, parseNumber } from "./csv";
import { NATIVE_SYSTEM } from "../connectors/native";
import { syncOrganization } from "../services/syncService";
import { orgMemberRoleName } from "../services/orgService";
import type { AuthenticatedRequest } from "../services/rbac";

type Authed = AuthenticatedRequest & { user: NonNullable<AuthenticatedRequest["user"]>; organizationId: string; orgRole: "owner" | "admin" | "member" };
interface Deps {
  authenticateToken: RequestHandler;
  requirePermission: (resource: string, action: string) => RequestHandler;
}

const WRITE_ROLES = new Set(["admin", "ops_manager", "finance", "cfo", "project_manager", "cost_manager"]);

/** Roles that may enter ledger data: owners/admins plus the operating and finance roles */
const requireLedgerWrite = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user || !req.organizationId) return res.status(401).json({ message: "Authentication required" });
  if (req.user.role === "admin" || req.orgRole === "owner" || req.orgRole === "admin") return next();
  const role = await orgMemberRoleName(req.user.id, req.organizationId);
  if (role && WRITE_ROLES.has(role)) return next();
  return res.status(403).json({ message: "Your role can view the ledger but not change it" });
};

// Debounced resync so a burst of edits produces one KPI recalculation
const pending = new Map<string, NodeJS.Timeout>();
function queueSync(organizationId: string, delayMs = 1500) {
  const t = pending.get(organizationId);
  if (t) clearTimeout(t);
  pending.set(organizationId, setTimeout(() => {
    pending.delete(organizationId);
    syncOrganization(organizationId).catch(err => console.error("ledger resync failed:", (err as Error).message));
  }, delayMs));
}

const TEMPLATES: Record<string, { columns: string[]; example: Record<string, string> }> = {
  customers: { columns: ["name", "email", "phone", "payment_terms_days"], example: { name: "Acme Corp", email: "ap@acme.example", phone: "555-0100", payment_terms_days: "30" } },
  items: { columns: ["sku", "name", "unit_cost", "unit_price", "on_hand"], example: { sku: "BRK-100", name: "Mounting bracket", unit_cost: "12.50", unit_price: "24.00", on_hand: "250" } },
  orders: { columns: ["order_number", "customer", "order_date", "requested_date", "sku", "description", "qty", "unit_price", "unit_cost", "due_date", "qty_shipped", "ship_date", "status"], example: { order_number: "SO-1001", customer: "Acme Corp", order_date: "2026-09-01", requested_date: "2026-09-20", sku: "BRK-100", description: "", qty: "40", unit_price: "24.00", unit_cost: "12.50", due_date: "2026-09-20", qty_shipped: "40", ship_date: "2026-09-18", status: "" } },
  invoices: { columns: ["invoice_number", "customer", "order_number", "invoice_date", "due_date", "amount", "credit_memo", "paid_amount", "paid_date"], example: { invoice_number: "INV-2001", customer: "Acme Corp", order_number: "SO-1001", invoice_date: "2026-09-19", due_date: "2026-10-19", amount: "960.00", credit_memo: "no", paid_amount: "960.00", paid_date: "2026-10-10" } },
  jobs: { columns: ["job_number", "sku", "qty", "start_date", "due_date", "completed_date", "status"], example: { job_number: "JOB-501", sku: "BRK-100", qty: "40", start_date: "2026-09-02", due_date: "2026-09-17", completed_date: "2026-09-16", status: "complete" } },
};

export function registerLedgerRoutes(app: Express, deps: Deps) {
  const { authenticateToken, requirePermission } = deps;
  const read = [authenticateToken, requirePermission("erp_connections", "read")];
  const write = [authenticateToken, requireLedgerWrite as RequestHandler];
  const h = (fn: (req: Authed, res: Response) => Promise<unknown>): RequestHandler => async (req, res) => {
    try {
      await fn(req as Authed, res);
    } catch (error) {
      const msg = (error as Error).message;
      res.status(/not found/i.test(msg) ? 404 : 400).json({ message: msg });
    }
  };

  app.get("/api/ledger/status", ...read, h(async (req, res) => {
    const connection = await storage.getErpConnection(req.organizationId, NATIVE_SYSTEM);
    res.json({ enabled: Boolean(connection?.isConnected), lastSync: connection?.lastSync ?? null, counts: await ledgerStorage.counts(req.organizationId) });
  }));

  /** Turn on "Jeldi is my ERP" for this organization: creates the native connection and syncs */
  app.post("/api/ledger/enable", ...write, h(async (req, res) => {
    let connection = await storage.getErpConnection(req.organizationId, NATIVE_SYSTEM);
    if (!connection) {
      connection = await storage.createErpConnection({
        userId: req.user.id, organizationId: req.organizationId, erpSystem: NATIVE_SYSTEM,
        connectionType: "native", authMethod: "none", isConnected: true,
        config: { organizationId: req.organizationId }, metadata: { displayName: "Jeldi Ledger (built-in)" },
      });
    } else if (!connection.isConnected) {
      connection = (await storage.updateErpConnection(connection.id, { isConnected: true, config: { organizationId: req.organizationId } }))!;
    }
    const results = await syncOrganization(req.organizationId);
    res.json({ enabled: true, connectionId: connection.id, sync: results.map(r => ({ erpSystem: r.erpSystem, ok: r.ok, message: r.message })) });
  }));

  app.post("/api/ledger/sync", ...write, h(async (req, res) => {
    const results = await syncOrganization(req.organizationId);
    res.json({ results });
  }));

  // ---- customers
  app.get("/api/ledger/customers", ...read, h(async (req, res) => res.json(await ledgerStorage.listCustomers(req.organizationId))));
  app.post("/api/ledger/customers", ...write, h(async (req, res) => {
    const { name, email, phone, paymentTermsDays, notes } = req.body ?? {};
    if (!name?.trim()) throw new Error("Name is required");
    res.status(201).json(await ledgerStorage.createCustomer(req.organizationId, { name, email, phone, paymentTermsDays: paymentTermsDays != null ? Number(paymentTermsDays) : undefined, notes }, req.user.id));
  }));
  app.put("/api/ledger/customers/:id", ...write, h(async (req, res) => {
    const row = await ledgerStorage.updateCustomer(req.organizationId, req.params.id, req.body ?? {});
    if (!row) throw new Error("Customer not found");
    res.json(row);
  }));
  app.delete("/api/ledger/customers/:id", ...write, h(async (req, res) => res.json({ deleted: await ledgerStorage.deleteCustomer(req.organizationId, req.params.id) })));

  // ---- items
  app.get("/api/ledger/items", ...read, h(async (req, res) => res.json(await ledgerStorage.listItems(req.organizationId))));
  app.post("/api/ledger/items", ...write, h(async (req, res) => {
    const { sku, name, unitCost, unitPrice, onHand } = req.body ?? {};
    if (!sku?.trim() || !name?.trim()) throw new Error("SKU and name are required");
    if (await ledgerStorage.findItemBySku(req.organizationId, sku)) throw new Error("An item with that SKU already exists");
    res.status(201).json(await ledgerStorage.createItem(req.organizationId, { sku, name, unitCost: parseNumber(unitCost), unitPrice: parseNumber(unitPrice), onHand: parseNumber(onHand) }));
    queueSync(req.organizationId);
  }));
  app.put("/api/ledger/items/:id", ...write, h(async (req, res) => {
    const b = req.body ?? {};
    const row = await ledgerStorage.updateItem(req.organizationId, req.params.id, {
      sku: b.sku, name: b.name, isActive: b.isActive,
      unitCost: b.unitCost !== undefined ? parseNumber(b.unitCost) : undefined,
      unitPrice: b.unitPrice !== undefined ? parseNumber(b.unitPrice) : undefined,
      onHand: b.onHand !== undefined ? parseNumber(b.onHand) : undefined,
    });
    if (!row) throw new Error("Item not found");
    res.json(row);
    queueSync(req.organizationId);
  }));
  app.delete("/api/ledger/items/:id", ...write, h(async (req, res) => { res.json({ deleted: await ledgerStorage.deleteItem(req.organizationId, req.params.id) }); queueSync(req.organizationId); }));

  // ---- orders
  app.get("/api/ledger/orders", ...read, h(async (req, res) => res.json(await ledgerStorage.listOrders(req.organizationId))));
  app.post("/api/ledger/orders", ...write, h(async (req, res) => {
    const b = req.body ?? {};
    if (!b.customerId) throw new Error("Customer is required");
    const lines = Array.isArray(b.lines) ? b.lines.map((l: any) => ({
      itemId: l.itemId || null, description: l.description || null, qty: parseNumber(l.qty),
      unitPrice: l.unitPrice !== undefined && l.unitPrice !== "" ? parseNumber(l.unitPrice) : undefined,
      unitCost: l.unitCost !== undefined && l.unitCost !== "" ? parseNumber(l.unitCost) : undefined,
      dueDate: parseDate(l.dueDate),
    })).filter((l: any) => l.qty > 0) : [];
    const order = await ledgerStorage.createOrder(req.organizationId, {
      number: b.number, customerId: b.customerId, orderDate: parseDate(b.orderDate) ?? undefined, requestedDate: parseDate(b.requestedDate), notes: b.notes ?? null, lines,
    }, req.user.id);
    res.status(201).json(order);
    queueSync(req.organizationId);
  }));
  app.put("/api/ledger/orders/:id", ...write, h(async (req, res) => {
    const b = req.body ?? {};
    await ledgerStorage.updateOrder(req.organizationId, req.params.id, { requestedDate: b.requestedDate !== undefined ? parseDate(b.requestedDate) : undefined, notes: b.notes, status: b.status });
    res.json(await ledgerStorage.getOrder(req.organizationId, req.params.id));
    queueSync(req.organizationId);
  }));
  app.delete("/api/ledger/orders/:id", ...write, h(async (req, res) => { res.json({ deleted: await ledgerStorage.deleteOrder(req.organizationId, req.params.id) }); queueSync(req.organizationId); }));
  app.post("/api/ledger/orders/:id/ship", ...write, h(async (req, res) => {
    const { lineId, qty, shipDate } = req.body ?? {};
    if (!lineId) throw new Error("lineId is required");
    const shipment = await ledgerStorage.shipLine(req.organizationId, lineId, parseNumber(qty), parseDate(shipDate) ?? undefined);
    res.status(201).json({ shipment, order: await ledgerStorage.getOrder(req.organizationId, req.params.id) });
    queueSync(req.organizationId);
  }));
  app.post("/api/ledger/orders/:id/invoice", ...write, h(async (req, res) => {
    const invoice = await ledgerStorage.invoiceOrder(req.organizationId, req.params.id, parseDate(req.body?.invoiceDate) ?? undefined);
    res.status(201).json(invoice);
    queueSync(req.organizationId);
  }));

  // ---- invoices & payments
  app.get("/api/ledger/invoices", ...read, h(async (req, res) => res.json(await ledgerStorage.listInvoices(req.organizationId))));
  app.post("/api/ledger/invoices", ...write, h(async (req, res) => {
    const b = req.body ?? {};
    if (!b.customerId) throw new Error("Customer is required");
    const amount = parseNumber(b.amount);
    if (!(amount > 0)) throw new Error("Amount must be positive");
    res.status(201).json(await ledgerStorage.createInvoice(req.organizationId, { number: b.number, customerId: b.customerId, orderId: b.orderId || null, invoiceDate: parseDate(b.invoiceDate) ?? undefined, dueDate: parseDate(b.dueDate), amount, isCreditMemo: Boolean(b.isCreditMemo), notes: b.notes ?? null }));
    queueSync(req.organizationId);
  }));
  app.delete("/api/ledger/invoices/:id", ...write, h(async (req, res) => { res.json({ deleted: await ledgerStorage.deleteInvoice(req.organizationId, req.params.id) }); queueSync(req.organizationId); }));
  app.post("/api/ledger/invoices/:id/payments", ...write, h(async (req, res) => {
    const { amount, paymentDate, reference } = req.body ?? {};
    res.status(201).json(await ledgerStorage.recordPayment(req.organizationId, req.params.id, parseNumber(amount), parseDate(paymentDate) ?? undefined, reference ?? null));
    queueSync(req.organizationId);
  }));

  // ---- jobs
  app.get("/api/ledger/jobs", ...read, h(async (req, res) => res.json(await ledgerStorage.listJobs(req.organizationId))));
  app.post("/api/ledger/jobs", ...write, h(async (req, res) => {
    const b = req.body ?? {};
    res.status(201).json(await ledgerStorage.createJob(req.organizationId, { number: b.number, itemId: b.itemId || null, orderLineId: b.orderLineId || null, qty: b.qty !== undefined ? parseNumber(b.qty, 1) : undefined, startDate: parseDate(b.startDate), dueDate: parseDate(b.dueDate), completedDate: parseDate(b.completedDate), notes: b.notes ?? null }));
    queueSync(req.organizationId);
  }));
  app.put("/api/ledger/jobs/:id", ...write, h(async (req, res) => {
    const b = req.body ?? {};
    const row = await ledgerStorage.updateJob(req.organizationId, req.params.id, {
      startDate: b.startDate !== undefined ? parseDate(b.startDate) : undefined, dueDate: b.dueDate !== undefined ? parseDate(b.dueDate) : undefined,
      completedDate: b.completedDate !== undefined ? parseDate(b.completedDate) : undefined, status: b.status, qty: b.qty !== undefined ? parseNumber(b.qty, 1) : undefined, notes: b.notes,
    });
    if (!row) throw new Error("Job not found");
    res.json(row);
    queueSync(req.organizationId);
  }));
  app.post("/api/ledger/jobs/:id/complete", ...write, h(async (req, res) => {
    const row = await ledgerStorage.updateJob(req.organizationId, req.params.id, { completedDate: parseDate(req.body?.completedDate) ?? new Date().toISOString().slice(0, 10), status: "complete" });
    if (!row) throw new Error("Job not found");
    res.json(row);
    queueSync(req.organizationId);
  }));
  app.delete("/api/ledger/jobs/:id", ...write, h(async (req, res) => { res.json({ deleted: await ledgerStorage.deleteJob(req.organizationId, req.params.id) }); queueSync(req.organizationId); }));

  // ---- CSV templates and import
  app.get("/api/ledger/templates/:entity", ...read, h(async (req, res) => {
    const t = TEMPLATES[req.params.entity];
    if (!t) throw new Error("Unknown template");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="jeldi-${req.params.entity}-template.csv"`);
    res.send(toCsv([t.example], t.columns));
  }));

  app.post("/api/ledger/import/:entity", ...write, h(async (req, res) => {
    const entity = req.params.entity;
    const csv = typeof req.body?.csv === "string" ? req.body.csv : "";
    if (!csv.trim()) throw new Error("csv is required");
    if (!TEMPLATES[entity]) throw new Error("Unknown import type");
    const rows = parseCsv(csv);
    const result = await importRows(req.organizationId, req.user.id, entity, rows);
    res.json(result);
    queueSync(req.organizationId, 500);
  }));
}

interface ImportResult { imported: number; updated: number; skipped: number; errors: string[]; }

/** Idempotent-ish importers: rows are matched by number/sku/name so re-importing a file does not duplicate */
export async function importRows(orgId: string, userId: string, entity: string, rows: Record<string, string>[]): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
  const fail = (i: number, msg: string) => { result.errors.push(`row ${i + 2}: ${msg}`); result.skipped++; };

  const customerFor = async (name: string) => {
    if (!name?.trim()) return null;
    return (await ledgerStorage.findCustomerByName(orgId, name)) ?? (await ledgerStorage.createCustomer(orgId, { name }, userId));
  };
  const itemFor = async (sku: string, description?: string, unitCost?: number, unitPrice?: number) => {
    if (!sku?.trim()) return null;
    return (await ledgerStorage.findItemBySku(orgId, sku)) ?? (await ledgerStorage.createItem(orgId, { sku, name: description || sku, unitCost: unitCost ?? 0, unitPrice: unitPrice ?? 0 }));
  };

  if (entity === "customers") {
    for (const [i, r] of rows.entries()) {
      if (!r.name) { fail(i, "name is required"); continue; }
      const existing = await ledgerStorage.findCustomerByName(orgId, r.name);
      const data = { name: r.name, email: r.email || null, phone: r.phone || null, paymentTermsDays: r.payment_terms_days ? parseNumber(r.payment_terms_days, 30) : 30 };
      if (existing) { await ledgerStorage.updateCustomer(orgId, existing.id, data); result.updated++; }
      else { await ledgerStorage.createCustomer(orgId, data, userId); result.imported++; }
    }
    return result;
  }

  if (entity === "items") {
    for (const [i, r] of rows.entries()) {
      if (!r.sku || !r.name) { fail(i, "sku and name are required"); continue; }
      const data = { sku: r.sku, name: r.name, unitCost: parseNumber(r.unit_cost), unitPrice: parseNumber(r.unit_price), onHand: parseNumber(r.on_hand) };
      const existing = await ledgerStorage.findItemBySku(orgId, r.sku);
      if (existing) { await ledgerStorage.updateItem(orgId, existing.id, data); result.updated++; }
      else { await ledgerStorage.createItem(orgId, data); result.imported++; }
    }
    return result;
  }

  if (entity === "orders") {
    // one row per line, grouped by order_number; existing order numbers are skipped
    const groups = new Map<string, Record<string, string>[]>();
    for (const [i, r] of rows.entries()) {
      if (!r.order_number) { fail(i, "order_number is required"); continue; }
      const g = groups.get(r.order_number) ?? []; g.push({ ...r, _row: String(i) }); groups.set(r.order_number, g);
    }
    for (const [number, lines] of groups) {
      const first = lines[0];
      if (await ledgerStorage.findOrderByNumber(orgId, number)) { result.skipped += lines.length; continue; }
      const customer = await customerFor(first.customer);
      if (!customer) { fail(Number(first._row), "customer is required"); continue; }
      const lineData = [] as any[];
      for (const l of lines) {
        const qty = parseNumber(l.qty);
        if (!(qty > 0)) { fail(Number(l._row), "qty must be positive"); continue; }
        const item = await itemFor(l.sku, l.description, l.unit_cost ? parseNumber(l.unit_cost) : undefined, l.unit_price ? parseNumber(l.unit_price) : undefined);
        lineData.push({
          itemId: item?.id ?? null, description: l.description || item?.name || null, qty,
          unitPrice: l.unit_price ? parseNumber(l.unit_price) : num(item?.unitPrice), unitCost: l.unit_cost ? parseNumber(l.unit_cost) : num(item?.unitCost),
          dueDate: parseDate(l.due_date) ?? parseDate(first.requested_date), _shipQty: parseNumber(l.qty_shipped), _shipDate: parseDate(l.ship_date),
        });
      }
      if (lineData.length === 0) continue;
      const status = (first.status || "").toLowerCase();
      const order = await ledgerStorage.createOrder(orgId, {
        number, customerId: customer.id, orderDate: parseDate(first.order_date) ?? undefined, requestedDate: parseDate(first.requested_date),
        status: status === "cancelled" ? "cancelled" : "open", lines: lineData.map(({ _shipQty, _shipDate, ...l }) => l),
      }, userId);
      // historical shipments recorded from qty_shipped / ship_date
      for (const [idx, l] of lineData.entries()) {
        if (l._shipQty > 0 && order.lines[idx]) {
          try { await ledgerStorage.shipLine(orgId, order.lines[idx].id, Math.min(l._shipQty, l.qty), l._shipDate ?? parseDate(first.order_date) ?? undefined); } catch (e) { result.errors.push(`${number} line ${idx + 1}: ${(e as Error).message}`); }
        }
      }
      if (status === "closed") await ledgerStorage.updateOrder(orgId, order.id, { status: "closed" });
      result.imported += lineData.length;
    }
    return result;
  }

  if (entity === "invoices") {
    for (const [i, r] of rows.entries()) {
      if (!r.invoice_number) { fail(i, "invoice_number is required"); continue; }
      if (await ledgerStorage.findInvoiceByNumber(orgId, r.invoice_number)) { result.skipped++; continue; }
      const customer = await customerFor(r.customer);
      if (!customer) { fail(i, "customer is required"); continue; }
      const amount = parseNumber(r.amount);
      if (!(amount > 0)) { fail(i, "amount must be positive"); continue; }
      const order = r.order_number ? await ledgerStorage.findOrderByNumber(orgId, r.order_number) : undefined;
      const inv = await ledgerStorage.createInvoice(orgId, {
        number: r.invoice_number, customerId: customer.id, orderId: order?.id ?? null, invoiceDate: parseDate(r.invoice_date) ?? undefined,
        dueDate: parseDate(r.due_date), amount, isCreditMemo: /^(y|yes|true|1)$/i.test(r.credit_memo ?? ""),
      });
      const paid = parseNumber(r.paid_amount);
      if (paid > 0 && !inv.isCreditMemo) await ledgerStorage.recordPayment(orgId, inv.id, paid, parseDate(r.paid_date) ?? inv.invoiceDate, "import");
      result.imported++;
    }
    return result;
  }

  if (entity === "jobs") {
    for (const [i, r] of rows.entries()) {
      if (!r.job_number) { fail(i, "job_number is required"); continue; }
      if (await ledgerStorage.findJobByNumber(orgId, r.job_number)) { result.skipped++; continue; }
      const item = await itemFor(r.sku);
      const completed = parseDate(r.completed_date);
      const status = (r.status || "").toLowerCase();
      await ledgerStorage.createJob(orgId, {
        number: r.job_number, itemId: item?.id ?? null, qty: parseNumber(r.qty, 1), startDate: parseDate(r.start_date), dueDate: parseDate(r.due_date),
        completedDate: completed, status: status === "cancelled" ? "cancelled" : completed || status === "complete" ? "complete" : "open",
      });
      result.imported++;
    }
    return result;
  }
  throw new Error("Unknown import type");
}
