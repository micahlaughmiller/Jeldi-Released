/**
 * Data access for the built-in ledger. Every query is scoped by organizationId.
 * Numbers come back from Postgres as strings; callers use num() when they need arithmetic.
 */
import { db } from "../db";
import { eq, and, desc, asc, inArray, sql } from "drizzle-orm";
import {
  ledgerCustomers, ledgerItems, ledgerOrders, ledgerOrderLines, ledgerShipments, ledgerInvoices, ledgerPayments, ledgerJobs,
  type LedgerCustomer, type LedgerItem, type LedgerOrder, type LedgerOrderLine, type LedgerShipment, type LedgerInvoice, type LedgerPayment, type LedgerJob,
} from "@shared/ledger-schema";

export const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const money = (n: number) => n.toFixed(2);
const qtyStr = (n: number) => n.toFixed(3);
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, days: number) => new Date(new Date(d).getTime() + days * 86_400_000).toISOString().slice(0, 10);

export interface OrderWithLines extends LedgerOrder {
  customerName: string;
  lines: (LedgerOrderLine & { sku: string | null; itemName: string | null })[];
  total: number;
  invoiced: boolean;
}
export interface InvoiceWithBalance extends LedgerInvoice {
  customerName: string;
  orderNumber: string | null;
  paid: number;
  balance: number;
}

export class LedgerStorage {
  // ---- customers
  async listCustomers(orgId: string): Promise<LedgerCustomer[]> {
    return db.select().from(ledgerCustomers).where(eq(ledgerCustomers.organizationId, orgId)).orderBy(asc(ledgerCustomers.name));
  }
  async findCustomerByName(orgId: string, name: string): Promise<LedgerCustomer | undefined> {
    const [row] = await db.select().from(ledgerCustomers)
      .where(and(eq(ledgerCustomers.organizationId, orgId), sql`lower(${ledgerCustomers.name}) = ${name.trim().toLowerCase()}`));
    return row;
  }
  async createCustomer(orgId: string, data: Partial<LedgerCustomer> & { name: string }, createdBy?: string): Promise<LedgerCustomer> {
    const [row] = await db.insert(ledgerCustomers).values({
      organizationId: orgId, name: data.name.trim(), email: data.email ?? null, phone: data.phone ?? null,
      paymentTermsDays: data.paymentTermsDays ?? 30, notes: data.notes ?? null, createdBy: createdBy ?? null,
    }).returning();
    return row;
  }
  async updateCustomer(orgId: string, id: string, data: Partial<LedgerCustomer>): Promise<LedgerCustomer | undefined> {
    const { id: _i, organizationId: _o, createdAt: _c, ...rest } = data as any;
    const [row] = await db.update(ledgerCustomers).set({ ...rest, updatedAt: new Date() })
      .where(and(eq(ledgerCustomers.id, id), eq(ledgerCustomers.organizationId, orgId))).returning();
    return row;
  }
  async deleteCustomer(orgId: string, id: string): Promise<boolean> {
    const used = await db.select({ id: ledgerOrders.id }).from(ledgerOrders).where(and(eq(ledgerOrders.customerId, id), eq(ledgerOrders.organizationId, orgId))).limit(1);
    if (used.length) throw new Error("Customer has orders; cannot delete");
    const r = await db.delete(ledgerCustomers).where(and(eq(ledgerCustomers.id, id), eq(ledgerCustomers.organizationId, orgId)));
    return ((r as any).rowCount ?? (r as any).affectedRows ?? 0) > 0;
  }

  // ---- items
  async listItems(orgId: string): Promise<LedgerItem[]> {
    return db.select().from(ledgerItems).where(eq(ledgerItems.organizationId, orgId)).orderBy(asc(ledgerItems.sku));
  }
  async findItemBySku(orgId: string, sku: string): Promise<LedgerItem | undefined> {
    const [row] = await db.select().from(ledgerItems)
      .where(and(eq(ledgerItems.organizationId, orgId), sql`lower(${ledgerItems.sku}) = ${sku.trim().toLowerCase()}`));
    return row;
  }
  async createItem(orgId: string, data: { sku: string; name: string; unitCost?: number; unitPrice?: number; onHand?: number }): Promise<LedgerItem> {
    const [row] = await db.insert(ledgerItems).values({
      organizationId: orgId, sku: data.sku.trim(), name: data.name.trim(),
      unitCost: (data.unitCost ?? 0).toFixed(4), unitPrice: (data.unitPrice ?? 0).toFixed(4), onHand: qtyStr(data.onHand ?? 0),
    }).returning();
    return row;
  }
  async updateItem(orgId: string, id: string, data: { sku?: string; name?: string; unitCost?: number; unitPrice?: number; onHand?: number; isActive?: boolean }): Promise<LedgerItem | undefined> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (data.sku !== undefined) set.sku = data.sku.trim();
    if (data.name !== undefined) set.name = data.name.trim();
    if (data.unitCost !== undefined) set.unitCost = data.unitCost.toFixed(4);
    if (data.unitPrice !== undefined) set.unitPrice = data.unitPrice.toFixed(4);
    if (data.onHand !== undefined) set.onHand = qtyStr(data.onHand);
    if (data.isActive !== undefined) set.isActive = data.isActive;
    const [row] = await db.update(ledgerItems).set(set).where(and(eq(ledgerItems.id, id), eq(ledgerItems.organizationId, orgId))).returning();
    return row;
  }
  async deleteItem(orgId: string, id: string): Promise<boolean> {
    const used = await db.select({ id: ledgerOrderLines.id }).from(ledgerOrderLines).where(and(eq(ledgerOrderLines.itemId, id), eq(ledgerOrderLines.organizationId, orgId))).limit(1);
    if (used.length) {
      await db.update(ledgerItems).set({ isActive: false }).where(and(eq(ledgerItems.id, id), eq(ledgerItems.organizationId, orgId)));
      return true;
    }
    const r = await db.delete(ledgerItems).where(and(eq(ledgerItems.id, id), eq(ledgerItems.organizationId, orgId)));
    return ((r as any).rowCount ?? (r as any).affectedRows ?? 0) > 0;
  }

  // ---- orders
  async listOrders(orgId: string, limit = 500): Promise<OrderWithLines[]> {
    const orders = await db.select({ order: ledgerOrders, customerName: ledgerCustomers.name })
      .from(ledgerOrders).innerJoin(ledgerCustomers, eq(ledgerOrders.customerId, ledgerCustomers.id))
      .where(eq(ledgerOrders.organizationId, orgId)).orderBy(desc(ledgerOrders.orderDate), desc(ledgerOrders.createdAt)).limit(limit);
    if (orders.length === 0) return [];
    const ids = orders.map(o => o.order.id);
    const lines = await db.select({ line: ledgerOrderLines, sku: ledgerItems.sku, itemName: ledgerItems.name })
      .from(ledgerOrderLines).leftJoin(ledgerItems, eq(ledgerOrderLines.itemId, ledgerItems.id))
      .where(inArray(ledgerOrderLines.orderId, ids)).orderBy(asc(ledgerOrderLines.lineNo));
    const invoiced = new Set((await db.select({ orderId: ledgerInvoices.orderId }).from(ledgerInvoices).where(and(eq(ledgerInvoices.organizationId, orgId), inArray(ledgerInvoices.orderId, ids)))).map(r => r.orderId));
    return orders.map(({ order, customerName }) => {
      const ls = lines.filter(l => l.line.orderId === order.id).map(l => ({ ...l.line, sku: l.sku, itemName: l.itemName }));
      return { ...order, customerName, lines: ls, total: ls.reduce((s, l) => s + num(l.qty) * num(l.unitPrice), 0), invoiced: invoiced.has(order.id) };
    });
  }
  async getOrder(orgId: string, id: string): Promise<OrderWithLines | undefined> {
    const [row] = await db.select().from(ledgerOrders).where(and(eq(ledgerOrders.id, id), eq(ledgerOrders.organizationId, orgId)));
    if (!row) return undefined;
    const all = await this.listOrders(orgId, 100000);
    return all.find(o => o.id === id);
  }
  async findOrderByNumber(orgId: string, number: string): Promise<LedgerOrder | undefined> {
    const [row] = await db.select().from(ledgerOrders).where(and(eq(ledgerOrders.organizationId, orgId), eq(ledgerOrders.number, number.trim())));
    return row;
  }
  async nextNumber(orgId: string, kind: "order" | "invoice" | "job"): Promise<string> {
    const table = kind === "order" ? ledgerOrders : kind === "invoice" ? ledgerInvoices : ledgerJobs;
    const prefix = kind === "order" ? "SO-" : kind === "invoice" ? "INV-" : "JOB-";
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(table).where(eq(table.organizationId, orgId));
    return `${prefix}${String(Number(count) + 1).padStart(5, "0")}`;
  }
  async createOrder(orgId: string, data: {
    number?: string; customerId: string; orderDate?: string; requestedDate?: string | null; notes?: string | null; status?: string;
    lines: Array<{ itemId?: string | null; description?: string | null; qty: number; unitPrice?: number; unitCost?: number; dueDate?: string | null; qtyShipped?: number }>;
  }, createdBy?: string): Promise<OrderWithLines> {
    if (!data.lines?.length) throw new Error("An order needs at least one line");
    const items = await this.listItems(orgId);
    const number = data.number?.trim() || await this.nextNumber(orgId, "order");
    const [order] = await db.insert(ledgerOrders).values({
      organizationId: orgId, number, customerId: data.customerId, orderDate: data.orderDate || today(),
      requestedDate: data.requestedDate ?? null, status: data.status ?? "open", notes: data.notes ?? null, createdBy: createdBy ?? null,
    }).returning();
    let lineNo = 1;
    for (const l of data.lines) {
      const item = l.itemId ? items.find(i => i.id === l.itemId) : undefined;
      await db.insert(ledgerOrderLines).values({
        organizationId: orgId, orderId: order.id, lineNo: lineNo++, itemId: item?.id ?? null,
        description: l.description ?? item?.name ?? null, qty: qtyStr(l.qty),
        unitPrice: (l.unitPrice ?? num(item?.unitPrice)).toFixed(4), unitCost: (l.unitCost ?? num(item?.unitCost)).toFixed(4),
        dueDate: l.dueDate ?? data.requestedDate ?? null, qtyShipped: qtyStr(l.qtyShipped ?? 0),
      });
    }
    return (await this.getOrder(orgId, order.id))!;
  }
  async updateOrder(orgId: string, id: string, data: { requestedDate?: string | null; notes?: string | null; status?: string }): Promise<void> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (data.requestedDate !== undefined) set.requestedDate = data.requestedDate;
    if (data.notes !== undefined) set.notes = data.notes;
    if (data.status !== undefined) set.status = data.status;
    await db.update(ledgerOrders).set(set).where(and(eq(ledgerOrders.id, id), eq(ledgerOrders.organizationId, orgId)));
  }
  async deleteOrder(orgId: string, id: string): Promise<boolean> {
    const inv = await db.select({ id: ledgerInvoices.id }).from(ledgerInvoices).where(and(eq(ledgerInvoices.orderId, id), eq(ledgerInvoices.organizationId, orgId))).limit(1);
    if (inv.length) throw new Error("Order has an invoice; cancel it instead");
    await db.delete(ledgerShipments).where(and(eq(ledgerShipments.orderId, id), eq(ledgerShipments.organizationId, orgId)));
    await db.update(ledgerJobs).set({ orderLineId: null }).where(and(eq(ledgerJobs.organizationId, orgId), inArray(ledgerJobs.orderLineId, db.select({ id: ledgerOrderLines.id }).from(ledgerOrderLines).where(eq(ledgerOrderLines.orderId, id)))));
    await db.delete(ledgerOrderLines).where(and(eq(ledgerOrderLines.orderId, id), eq(ledgerOrderLines.organizationId, orgId)));
    const r = await db.delete(ledgerOrders).where(and(eq(ledgerOrders.id, id), eq(ledgerOrders.organizationId, orgId)));
    return ((r as any).rowCount ?? (r as any).affectedRows ?? 0) > 0;
  }

  /** Ship part or all of a line: records the shipment, bumps qtyShipped, draws inventory, closes the order when everything shipped */
  async shipLine(orgId: string, lineId: string, qty: number, shipDate?: string): Promise<LedgerShipment> {
    const [line] = await db.select().from(ledgerOrderLines).where(and(eq(ledgerOrderLines.id, lineId), eq(ledgerOrderLines.organizationId, orgId)));
    if (!line) throw new Error("Order line not found");
    if (!(qty > 0)) throw new Error("Quantity must be positive");
    const remaining = num(line.qty) - num(line.qtyShipped);
    if (qty > remaining + 1e-9) throw new Error(`Only ${remaining} left to ship on this line`);
    const [shipment] = await db.insert(ledgerShipments).values({ organizationId: orgId, orderId: line.orderId, lineId, shipDate: shipDate || today(), qty: qtyStr(qty) }).returning();
    await db.update(ledgerOrderLines).set({ qtyShipped: qtyStr(num(line.qtyShipped) + qty) }).where(eq(ledgerOrderLines.id, lineId));
    if (line.itemId) {
      const [item] = await db.select().from(ledgerItems).where(eq(ledgerItems.id, line.itemId));
      if (item) await db.update(ledgerItems).set({ onHand: qtyStr(num(item.onHand) - qty) }).where(eq(ledgerItems.id, item.id));
    }
    const lines = await db.select().from(ledgerOrderLines).where(eq(ledgerOrderLines.orderId, line.orderId));
    if (lines.every(l => num(l.qtyShipped) + 1e-9 >= num(l.qty))) {
      await db.update(ledgerOrders).set({ status: "closed", updatedAt: new Date() }).where(eq(ledgerOrders.id, line.orderId));
    }
    return shipment;
  }

  // ---- invoices / payments
  async listInvoices(orgId: string, limit = 1000): Promise<InvoiceWithBalance[]> {
    const rows = await db.select({ inv: ledgerInvoices, customerName: ledgerCustomers.name, orderNumber: ledgerOrders.number })
      .from(ledgerInvoices)
      .innerJoin(ledgerCustomers, eq(ledgerInvoices.customerId, ledgerCustomers.id))
      .leftJoin(ledgerOrders, eq(ledgerInvoices.orderId, ledgerOrders.id))
      .where(eq(ledgerInvoices.organizationId, orgId)).orderBy(desc(ledgerInvoices.invoiceDate), desc(ledgerInvoices.createdAt)).limit(limit);
    const pays = await db.select({ invoiceId: ledgerPayments.invoiceId, total: sql<string>`sum(${ledgerPayments.amount})` })
      .from(ledgerPayments).where(eq(ledgerPayments.organizationId, orgId)).groupBy(ledgerPayments.invoiceId);
    const paid = new Map(pays.map(p => [p.invoiceId, num(p.total)]));
    return rows.map(({ inv, customerName, orderNumber }) => {
      const p = paid.get(inv.id) ?? 0;
      return { ...inv, customerName, orderNumber: orderNumber ?? null, paid: p, balance: inv.isCreditMemo ? 0 : Math.max(0, num(inv.amount) - p) };
    });
  }
  async createInvoice(orgId: string, data: { number?: string; customerId: string; orderId?: string | null; invoiceDate?: string; dueDate?: string | null; amount: number; isCreditMemo?: boolean; notes?: string | null }): Promise<LedgerInvoice> {
    const number = data.number?.trim() || await this.nextNumber(orgId, "invoice");
    const invoiceDate = data.invoiceDate || today();
    let dueDate = data.dueDate ?? null;
    if (!dueDate && !data.isCreditMemo) {
      const [cust] = await db.select().from(ledgerCustomers).where(eq(ledgerCustomers.id, data.customerId));
      dueDate = addDays(invoiceDate, cust?.paymentTermsDays ?? 30);
    }
    const [row] = await db.insert(ledgerInvoices).values({
      organizationId: orgId, number, customerId: data.customerId, orderId: data.orderId ?? null, invoiceDate, dueDate,
      amount: money(Math.abs(data.amount)), isCreditMemo: Boolean(data.isCreditMemo), notes: data.notes ?? null,
    }).returning();
    return row;
  }
  /** Invoice everything shipped on an order (one invoice per order in this first version) */
  async invoiceOrder(orgId: string, orderId: string, invoiceDate?: string): Promise<LedgerInvoice> {
    const order = await this.getOrder(orgId, orderId);
    if (!order) throw new Error("Order not found");
    if (order.invoiced) throw new Error("This order already has an invoice");
    const amount = order.lines.reduce((s, l) => s + num(l.qtyShipped) * num(l.unitPrice), 0);
    if (!(amount > 0)) throw new Error("Nothing has shipped on this order yet");
    return this.createInvoice(orgId, { customerId: order.customerId, orderId, invoiceDate, amount });
  }
  async findInvoiceByNumber(orgId: string, number: string): Promise<LedgerInvoice | undefined> {
    const [row] = await db.select().from(ledgerInvoices).where(and(eq(ledgerInvoices.organizationId, orgId), eq(ledgerInvoices.number, number.trim())));
    return row;
  }
  async recordPayment(orgId: string, invoiceId: string, amount: number, paymentDate?: string, reference?: string | null): Promise<LedgerPayment> {
    const [inv] = await db.select().from(ledgerInvoices).where(and(eq(ledgerInvoices.id, invoiceId), eq(ledgerInvoices.organizationId, orgId)));
    if (!inv) throw new Error("Invoice not found");
    if (!(amount > 0)) throw new Error("Amount must be positive");
    const [row] = await db.insert(ledgerPayments).values({ organizationId: orgId, invoiceId, paymentDate: paymentDate || today(), amount: money(amount), reference: reference ?? null }).returning();
    return row;
  }
  async deleteInvoice(orgId: string, id: string): Promise<boolean> {
    await db.delete(ledgerPayments).where(and(eq(ledgerPayments.invoiceId, id), eq(ledgerPayments.organizationId, orgId)));
    const r = await db.delete(ledgerInvoices).where(and(eq(ledgerInvoices.id, id), eq(ledgerInvoices.organizationId, orgId)));
    return ((r as any).rowCount ?? (r as any).affectedRows ?? 0) > 0;
  }

  // ---- jobs
  async listJobs(orgId: string, limit = 1000): Promise<(LedgerJob & { sku: string | null; itemName: string | null })[]> {
    const rows = await db.select({ job: ledgerJobs, sku: ledgerItems.sku, itemName: ledgerItems.name })
      .from(ledgerJobs).leftJoin(ledgerItems, eq(ledgerJobs.itemId, ledgerItems.id))
      .where(eq(ledgerJobs.organizationId, orgId)).orderBy(desc(ledgerJobs.createdAt)).limit(limit);
    return rows.map(r => ({ ...r.job, sku: r.sku, itemName: r.itemName }));
  }
  async findJobByNumber(orgId: string, number: string): Promise<LedgerJob | undefined> {
    const [row] = await db.select().from(ledgerJobs).where(and(eq(ledgerJobs.organizationId, orgId), eq(ledgerJobs.number, number.trim())));
    return row;
  }
  async createJob(orgId: string, data: { number?: string; itemId?: string | null; orderLineId?: string | null; qty?: number; startDate?: string | null; dueDate?: string | null; completedDate?: string | null; status?: string; notes?: string | null }): Promise<LedgerJob> {
    const number = data.number?.trim() || await this.nextNumber(orgId, "job");
    const completed = data.completedDate ?? null;
    const [row] = await db.insert(ledgerJobs).values({
      organizationId: orgId, number, itemId: data.itemId ?? null, orderLineId: data.orderLineId ?? null, qty: qtyStr(data.qty ?? 1),
      startDate: data.startDate ?? today(), dueDate: data.dueDate ?? null, completedDate: completed,
      status: data.status ?? (completed ? "complete" : "open"), notes: data.notes ?? null,
    }).returning();
    return row;
  }
  async updateJob(orgId: string, id: string, data: { startDate?: string | null; dueDate?: string | null; completedDate?: string | null; status?: string; qty?: number; notes?: string | null }): Promise<LedgerJob | undefined> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ["startDate", "dueDate", "completedDate", "status", "notes"] as const) if (data[k] !== undefined) set[k] = data[k];
    if (data.qty !== undefined) set.qty = qtyStr(data.qty);
    if (data.completedDate && data.status === undefined) set.status = "complete";
    const [row] = await db.update(ledgerJobs).set(set).where(and(eq(ledgerJobs.id, id), eq(ledgerJobs.organizationId, orgId))).returning();
    return row;
  }
  async deleteJob(orgId: string, id: string): Promise<boolean> {
    const r = await db.delete(ledgerJobs).where(and(eq(ledgerJobs.id, id), eq(ledgerJobs.organizationId, orgId)));
    return ((r as any).rowCount ?? (r as any).affectedRows ?? 0) > 0;
  }

  // ---- everything the native connector needs, in one go
  async snapshotData(orgId: string) {
    const [customers, items, orders, lines, shipments, invoices, payments, jobs] = await Promise.all([
      db.select().from(ledgerCustomers).where(eq(ledgerCustomers.organizationId, orgId)),
      db.select().from(ledgerItems).where(eq(ledgerItems.organizationId, orgId)),
      db.select().from(ledgerOrders).where(eq(ledgerOrders.organizationId, orgId)),
      db.select().from(ledgerOrderLines).where(eq(ledgerOrderLines.organizationId, orgId)),
      db.select().from(ledgerShipments).where(eq(ledgerShipments.organizationId, orgId)),
      db.select().from(ledgerInvoices).where(eq(ledgerInvoices.organizationId, orgId)),
      db.select().from(ledgerPayments).where(eq(ledgerPayments.organizationId, orgId)),
      db.select().from(ledgerJobs).where(eq(ledgerJobs.organizationId, orgId)),
    ]);
    return { customers, items, orders, lines, shipments, invoices, payments, jobs };
  }
  async counts(orgId: string) {
    const d = await this.snapshotData(orgId);
    return { customers: d.customers.length, items: d.items.length, orders: d.orders.length, invoices: d.invoices.length, jobs: d.jobs.length, shipments: d.shipments.length, payments: d.payments.length };
  }
}

export const ledgerStorage = new LedgerStorage();
export type LedgerSnapshotData = Awaited<ReturnType<LedgerStorage["snapshotData"]>>;
