/**
 * QuickBooks Online: customers, items, invoices, payments, credit memos, sales receipts.
 * Finance source: also produces the canonical ErpSnapshot so revenue, receivables and
 * margin KPIs come straight from the books.
 *
 * Auth: OAuth2 through an Intuit app (QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET);
 * the callback stores the realmId (company id). Sandbox companies use the sandbox base URL.
 */
import { HttpClient, ErpHttpError } from "../connectors/http";
import { emptySnapshot, toDateString, toNumber, type ErpSnapshot, type FetchLike } from "../connectors/types";
import { type SourceConnector, type SourceCredentials, type SyncContext, type SourceSyncStats, type SourceItem, excerpt, DAY } from "./types";
import { ensureFreshToken, type RefreshSpec } from "./oauthRefresh";

export const QUICKBOOKS_SCOPES = ["com.intuit.quickbooks.accounting"];

export function quickbooksRefreshSpec(): RefreshSpec | null {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", clientId, clientSecret, basicAuth: true };
}

export class QuickBooksConnector implements SourceConnector {
  readonly provider = "quickbooks" as const;
  private readonly http: HttpClient;
  private readonly base: string;

  constructor(private readonly creds: SourceCredentials, private readonly fetchImpl?: FetchLike) {
    if (!creds.config.realmId) throw new Error("QuickBooks needs the company (realm) id");
    // apiBaseUrl is an override for tests / proxies; otherwise sandbox or production Intuit hosts
    const host = (creds.config.apiBaseUrl as string | undefined)?.replace(/\/+$/, "") || (creds.config.sandbox ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com");
    this.base = `${host}/v3/company/${creds.config.realmId}`;
    this.http = new HttpClient({ fetchImpl, timeoutMs: 45_000 });
  }

  private async auth(ctx: Pick<SyncContext, "saveCredentials"> | null) {
    const token = await ensureFreshToken(this.creds, quickbooksRefreshSpec(), ctx, this.fetchImpl);
    this.http.setHeader("Authorization", `Bearer ${token}`);
  }

  private async query<T = any>(entity: string, where: string | null, max = 5000): Promise<T[]> {
    const out: T[] = [];
    const pageSize = 1000;
    for (let start = 1; out.length < max; start += pageSize) {
      const q = `select * from ${entity}${where ? ` where ${where}` : ""} startposition ${start} maxresults ${pageSize}`;
      const body = await this.http.getJson<any>(`${this.base}/query?minorversion=75&query=${encodeURIComponent(q)}`);
      const rows: T[] = body?.QueryResponse?.[entity] ?? [];
      out.push(...rows);
      if (rows.length < pageSize) break;
    }
    return out.slice(0, max);
  }

  async testConnection() {
    try {
      await this.auth(null);
      const info = await this.http.getJson<any>(`${this.base}/companyinfo/${this.creds.config.realmId}?minorversion=75`);
      const name = info?.CompanyInfo?.CompanyName ?? "company";
      return { success: true, message: `Connected to QuickBooks: ${name}`, details: { company: name, realmId: this.creds.config.realmId } };
    } catch (error) {
      return { success: false, message: describe(error) };
    }
  }

  async sync(ctx: SyncContext): Promise<SourceSyncStats> {
    const warnings: string[] = [];
    let items = 0;
    const since = ctx.since ?? new Date(Date.now() - 400 * DAY);
    const sinceDate = since.toISOString().slice(0, 10);
    await this.auth(ctx);

    const pull = async (entity: string, where: string | null, map: (row: any) => SourceItem) => {
      try {
        const rows = await this.query(entity, where);
        await ctx.emit(rows.map(map));
        items += rows.length;
      } catch (e) { warnings.push(`${entity}: ${describe(e)}`); }
    };

    await pull("Customer", null, c => ({
      kind: "customer", externalId: c.Id, title: c.DisplayName, author: null, container: "Customers", state: c.Active === false ? "inactive" : "active",
      occurredAt: c.MetaData?.LastUpdatedTime, text: excerpt([c.CompanyName, c.PrimaryEmailAddr?.Address, c.PrimaryPhone?.FreeFormNumber].filter(Boolean).join(" ")),
      data: { balance: toNumber(c.Balance), email: c.PrimaryEmailAddr?.Address ?? null, terms: c.SalesTermRef?.name ?? null },
    }));
    await pull("Item", null, i => ({
      kind: "item", externalId: i.Id, title: i.Name, container: "Items", state: i.Active === false ? "inactive" : "active", occurredAt: i.MetaData?.LastUpdatedTime, text: excerpt(i.Description),
      data: { sku: i.Sku ?? null, type: i.Type, unitPrice: toNumber(i.UnitPrice), purchaseCost: toNumber(i.PurchaseCost), qtyOnHand: toNumber(i.QtyOnHand), trackQty: i.TrackQtyOnHand === true },
    }));
    const docWhere = `TxnDate >= '${sinceDate}'`;
    await pull("Invoice", docWhere, inv => ({
      kind: "invoice", externalId: inv.Id, title: `Invoice ${inv.DocNumber ?? inv.Id}`, author: inv.CustomerRef?.name ?? null, container: inv.CustomerRef?.name ?? "Invoices",
      state: toNumber(inv.Balance) === 0 ? "paid" : inv.DueDate && inv.DueDate < new Date().toISOString().slice(0, 10) ? "overdue" : "open",
      occurredAt: inv.TxnDate, text: excerpt(inv.PrivateNote ?? inv.CustomerMemo?.value),
      data: { docNumber: inv.DocNumber, txnDate: inv.TxnDate, dueDate: inv.DueDate ?? null, total: toNumber(inv.TotalAmt), balance: toNumber(inv.Balance), customer: inv.CustomerRef?.name ?? null,
        lines: (inv.Line ?? []).filter((l: any) => l.DetailType === "SalesItemLineDetail").map((l: any) => ({ item: l.SalesItemLineDetail?.ItemRef?.name ?? null, itemId: l.SalesItemLineDetail?.ItemRef?.value ?? null, qty: toNumber(l.SalesItemLineDetail?.Qty), unitPrice: toNumber(l.SalesItemLineDetail?.UnitPrice), amount: toNumber(l.Amount) })) },
    }));
    await pull("CreditMemo", docWhere, cm => ({
      kind: "credit_memo", externalId: cm.Id, title: `Credit memo ${cm.DocNumber ?? cm.Id}`, author: cm.CustomerRef?.name ?? null, container: cm.CustomerRef?.name ?? "Credit memos", state: "issued",
      occurredAt: cm.TxnDate, text: excerpt(cm.PrivateNote), data: { docNumber: cm.DocNumber, txnDate: cm.TxnDate, total: toNumber(cm.TotalAmt), customer: cm.CustomerRef?.name ?? null },
    }));
    await pull("Payment", docWhere, p => ({
      kind: "payment", externalId: p.Id, title: `Payment ${p.PaymentRefNum ?? p.Id}`, author: p.CustomerRef?.name ?? null, container: p.CustomerRef?.name ?? "Payments", state: "received",
      occurredAt: p.TxnDate, text: excerpt(p.PrivateNote), data: { txnDate: p.TxnDate, total: toNumber(p.TotalAmt), customer: p.CustomerRef?.name ?? null, invoiceIds: (p.Line ?? []).flatMap((l: any) => (l.LinkedTxn ?? []).filter((t: any) => t.TxnType === "Invoice").map((t: any) => t.TxnId)) },
    }));
    await pull("SalesReceipt", docWhere, sr => ({
      kind: "sales_receipt", externalId: sr.Id, title: `Sales receipt ${sr.DocNumber ?? sr.Id}`, author: sr.CustomerRef?.name ?? null, container: sr.CustomerRef?.name ?? "Sales receipts", state: "paid",
      occurredAt: sr.TxnDate, text: excerpt(sr.PrivateNote), data: { docNumber: sr.DocNumber, txnDate: sr.TxnDate, total: toNumber(sr.TotalAmt), customer: sr.CustomerRef?.name ?? null,
        lines: (sr.Line ?? []).filter((l: any) => l.DetailType === "SalesItemLineDetail").map((l: any) => ({ item: l.SalesItemLineDetail?.ItemRef?.name ?? null, itemId: l.SalesItemLineDetail?.ItemRef?.value ?? null, qty: toNumber(l.SalesItemLineDetail?.Qty), unitPrice: toNumber(l.SalesItemLineDetail?.UnitPrice), amount: toNumber(l.Amount) })) },
    }));

    for (const w of warnings) ctx.warn(w);
    return { items, warnings };
  }

  toErpSnapshot(items: SourceItem[], now: Date): ErpSnapshot {
    return quickbooksSnapshot(items, now);
  }
}

/** Build the canonical snapshot from stored QuickBooks records (pure, unit-testable) */
export function quickbooksSnapshot(items: SourceItem[], now: Date = new Date(), sinceDays = 400): ErpSnapshot {
  const snap = emptySnapshot("quickbooks", new Date(now.getTime() - sinceDays * DAY));
  snap.fetchedAt = now.toISOString();
  const d = (i: SourceItem) => (i.data ?? {}) as Record<string, any>;
  const itemCost = new Map<string, number>();
  for (const i of items.filter(x => x.kind === "item")) {
    const data = d(i);
    if (data.purchaseCost != null) itemCost.set(i.externalId, data.purchaseCost);
    if (data.trackQty && data.qtyOnHand != null) snap.inventory.push({ item: data.sku || i.title || i.externalId, onHand: data.qtyOnHand, unitCost: data.purchaseCost ?? null });
  }
  const lineMargin = (lines: any[], date: string) => {
    for (const l of lines ?? []) {
      const qty = l.qty ?? 1;
      const revenue = l.amount ?? (l.unitPrice ?? 0) * qty;
      const cost = (l.itemId && itemCost.get(l.itemId) != null) ? itemCost.get(l.itemId)! * qty : 0;
      if (revenue || cost) snap.margin.push({ date, revenue, cost, units: qty });
    }
  };
  for (const inv of items.filter(x => x.kind === "invoice")) {
    const data = d(inv);
    const date = toDateString(data.txnDate) ?? toDateString(inv.occurredAt) ?? now.toISOString().slice(0, 10);
    const total = data.total ?? 0;
    snap.invoices.push({ id: data.docNumber || inv.externalId, date, dueDate: toDateString(data.dueDate), customer: data.customer ?? null, amount: total, balance: data.balance ?? 0, isCreditMemo: false });
    // Invoices double as orders (QuickBooks has no separate sales order in most editions)
    snap.salesOrders.push({ id: data.docNumber || inv.externalId, orderDate: date, customer: data.customer ?? null, status: (data.balance ?? 0) === 0 ? "closed" : "open", amount: total, requestedDate: toDateString(data.dueDate) });
    lineMargin(data.lines, date);
  }
  for (const sr of items.filter(x => x.kind === "sales_receipt")) {
    const data = d(sr);
    const date = toDateString(data.txnDate) ?? now.toISOString().slice(0, 10);
    const total = data.total ?? 0;
    snap.invoices.push({ id: data.docNumber || sr.externalId, date, dueDate: date, customer: data.customer ?? null, amount: total, balance: 0, isCreditMemo: false });
    snap.salesOrders.push({ id: data.docNumber || sr.externalId, orderDate: date, customer: data.customer ?? null, status: "closed", amount: total, requestedDate: null });
    lineMargin(data.lines, date);
  }
  for (const cm of items.filter(x => x.kind === "credit_memo")) {
    const data = d(cm);
    const date = toDateString(data.txnDate) ?? now.toISOString().slice(0, 10);
    snap.invoices.push({ id: data.docNumber || cm.externalId, date, dueDate: null, customer: data.customer ?? null, amount: Math.abs(data.total ?? 0), balance: 0, isCreditMemo: true });
  }
  return snap;
}

function describe(error: unknown): string {
  if (error instanceof ErpHttpError) {
    if (error.status === 401) return "QuickBooks rejected the token (401): reconnect";
    if (error.status === 403) return "QuickBooks refused (403): app not authorised for this company";
    if (error.status === 429) return "QuickBooks rate limit (429): try again shortly";
    return `HTTP ${error.status}`;
  }
  return (error as Error).message;
}
