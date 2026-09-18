/**
 * Epicor Kinetic connector (REST API v2, OData).
 *
 * Endpoints follow the Kinetic REST v2 layout:
 *   {instanceUrl}/api/v2/odata/{Company}/{Service}/{EntitySet}?$select=...&$filter=...&$top=...&$skip=...
 * where child tables are exposed as their own entity sets (OrderRels, ShipDtls, InvcDtls, PartWhses).
 *
 * Authentication: HTTP Basic (Kinetic user) plus the mandatory `x-api-key` header from
 * Kinetic > System Setup > Security Maintenance > API Key Maintenance. A bearer token
 * (Epicor Identity / Azure AD) can be supplied instead of the Basic credentials.
 *
 * Field names come from the standard Erp.BO datasets. Tenants with customised tables can
 * override any entity set or field list through `config.overrides`.
 */
import { HttpClient, ErpHttpError } from "./http";
import {
  type ErpConnector, type ErpSnapshot, type ConnectionTestResult, type FetchLike,
  emptySnapshot, daysAgo, toDateString, toNumber,
} from "./types";

export interface EpicorCredentials {
  /** e.g. https://kinetic.example.com/EpicorERP or https://centralusdtapp01.epicorsaas.com/SaaS123 */
  instanceUrl: string;
  company: string;
  apiKey: string;
  username?: string;
  password?: string;
  /** Alternative to username/password */
  bearerToken?: string;
}

export interface EpicorOptions {
  fetchImpl?: FetchLike;
  /** Hard cap on rows pulled per entity set */
  maxRows?: number;
  pageSize?: number;
  /** Per-entity overrides: { salesOrders: { path: "Erp.BO.SalesOrderSvc/SalesOrders", select: [...] } } */
  overrides?: Partial<Record<EpicorEntity, { path?: string; select?: string[]; filter?: string }>>;
}

export type EpicorEntity = "companies" | "salesOrders" | "orderRels" | "shipDtls" | "shipHeads" | "invoices" | "invoiceLines" | "jobs" | "partWhses" | "partCosts";

const DEFAULT_ENTITIES: Record<EpicorEntity, { path: string; select: string[] }> = {
  companies:    { path: "Erp.BO.CompanySvc/Companies", select: ["Company1", "Name"] },
  salesOrders:  { path: "Erp.BO.SalesOrderSvc/SalesOrders", select: ["OrderNum", "OrderDate", "OpenOrder", "VoidOrder", "CustNum", "CustomerCustID", "RequestDate", "NeedByDate", "DocOrderAmt"] },
  orderRels:    { path: "Erp.BO.SalesOrderSvc/OrderRels", select: ["OrderNum", "OrderLine", "OrderRelNum", "NeedByDate", "ReqDate", "OurReqQty", "OpenRelease"] },
  shipHeads:    { path: "Erp.BO.CustShipSvc/CustShips", select: ["PackNum", "ShipDate", "CustNum"] },
  shipDtls:     { path: "Erp.BO.CustShipSvc/ShipDtls", select: ["PackNum", "OrderNum", "OrderLine", "OrderRelNum", "OurInventoryShipQty", "OurJobShipQty", "ShipDate"] },
  invoices:     { path: "Erp.BO.ARInvoiceSvc/ARInvoices", select: ["InvoiceNum", "InvoiceDate", "DueDate", "CustNum", "CustomerName", "DocInvoiceAmt", "DocInvoiceBal", "OpenInvoice", "CreditMemo", "Posted"] },
  invoiceLines: { path: "Erp.BO.ARInvoiceSvc/InvcDtls", select: ["InvoiceNum", "InvoiceLine", "DocExtPrice", "SellingShipQty", "MtlUnitCost", "LbrUnitCost", "BurUnitCost", "SubUnitCost", "MtlBurUnitCost"] },
  jobs:         { path: "Erp.BO.JobEntrySvc/JobEntries", select: ["JobNum", "StartDate", "DueDate", "ReqDueDate", "JobClosed", "JobComplete", "JobCompletionDate", "ProdQty", "JobReleased"] },
  partWhses:    { path: "Erp.BO.PartSvc/PartWhses", select: ["PartNum", "WarehouseCode", "OnHandQty"] },
  partCosts:    { path: "Erp.BO.PartSvc/PartCosts", select: ["PartNum", "CostID", "AvgMaterialCost", "AvgLaborCost", "AvgBurdenCost", "AvgSubContCost", "AvgMtlBurCost", "StdMaterialCost", "StdLaborCost", "StdBurdenCost", "StdSubContCost", "StdMtlBurCost"] },
};

export class EpicorConnector implements ErpConnector {
  readonly system = "epicor";
  private readonly http: HttpClient;
  private readonly base: string;
  private readonly maxRows: number;
  private readonly pageSize: number;
  private readonly overrides: NonNullable<EpicorOptions["overrides"]>;

  constructor(private readonly creds: EpicorCredentials, options: EpicorOptions = {}) {
    if (!creds.instanceUrl || !creds.company || !creds.apiKey) {
      throw new Error("Epicor connection needs instanceUrl, company and apiKey");
    }
    if (!creds.bearerToken && !(creds.username && creds.password)) {
      throw new Error("Epicor connection needs a username/password or a bearer token");
    }
    const headers: Record<string, string> = { "x-api-key": creds.apiKey };
    headers.Authorization = creds.bearerToken
      ? `Bearer ${creds.bearerToken}`
      : `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString("base64")}`;
    this.http = new HttpClient({ fetchImpl: options.fetchImpl, headers });
    this.base = `${creds.instanceUrl.replace(/\/+$/, "")}/api/v2/odata/${encodeURIComponent(creds.company)}`;
    this.maxRows = options.maxRows ?? 20_000;
    this.pageSize = options.pageSize ?? 1_000;
    this.overrides = options.overrides ?? {};
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const rows = await this.query("companies", undefined, 1);
      const company = rows[0];
      return {
        success: true,
        message: company ? `Connected to Epicor company ${company.Company1 ?? this.creds.company} (${company.Name ?? "unnamed"})` : "Connected to Epicor, but the company list came back empty",
        details: { company: this.creds.company },
      };
    } catch (error) {
      return { success: false, message: describe(error) };
    }
  }

  async fetchSnapshot(sinceDays = 400): Promise<ErpSnapshot> {
    const since = daysAgo(sinceDays);
    const snap = emptySnapshot(this.system, since);
    const sinceLit = since.toISOString();

    // Sales orders: anything still open plus anything placed in the window
    await this.step(snap, "salesOrders", `OpenOrder eq true or OrderDate ge ${sinceLit}`, rows => {
      for (const r of rows) {
        snap.salesOrders.push({
          id: String(r.OrderNum),
          orderDate: toDateString(r.OrderDate) ?? sinceLit.slice(0, 10),
          customer: r.CustomerCustID ?? (r.CustNum != null ? String(r.CustNum) : null),
          status: r.VoidOrder ? "cancelled" : r.OpenOrder ? "open" : "closed",
          amount: toNumber(r.DocOrderAmt),
          requestedDate: toDateString(r.NeedByDate ?? r.RequestDate),
        });
      }
    });

    // Releases give the promised date per line; shipments give the actual date
    const releases = new Map<string, { due: string | null; qty: number | null }>();
    await this.step(snap, "orderRels", `OpenRelease eq true or NeedByDate ge ${sinceLit} or ReqDate ge ${sinceLit}`, rows => {
      for (const r of rows) {
        releases.set(`${r.OrderNum}/${r.OrderLine}/${r.OrderRelNum}`, { due: toDateString(r.NeedByDate ?? r.ReqDate), qty: toNumber(r.OurReqQty) });
      }
    });
    const packDates = new Map<string, string | null>();
    await this.step(snap, "shipHeads", `ShipDate ge ${sinceLit}`, rows => {
      for (const r of rows) packDates.set(String(r.PackNum), toDateString(r.ShipDate));
    });
    await this.step(snap, "shipDtls", `ShipDate ge ${sinceLit}`, rows => {
      for (const r of rows) {
        const key = `${r.OrderNum}/${r.OrderLine}/${r.OrderRelNum}`;
        const rel = releases.get(key);
        const shipped = (toNumber(r.OurInventoryShipQty) ?? 0) + (toNumber(r.OurJobShipQty) ?? 0);
        snap.deliveries.push({
          orderId: String(r.OrderNum),
          line: `${r.OrderLine}/${r.OrderRelNum}`,
          dueDate: rel?.due ?? null,
          shippedDate: toDateString(r.ShipDate) ?? packDates.get(String(r.PackNum)) ?? null,
          qtyOrdered: rel?.qty ?? null,
          qtyShipped: shipped,
        });
      }
    });

    // AR invoices and their lines (lines carry unit costs for margin)
    await this.step(snap, "invoices", `OpenInvoice eq true or InvoiceDate ge ${sinceLit}`, rows => {
      for (const r of rows) {
        if (r.Posted === false) continue;
        const amount = Math.abs(toNumber(r.DocInvoiceAmt) ?? 0);
        snap.invoices.push({
          id: String(r.InvoiceNum),
          date: toDateString(r.InvoiceDate) ?? sinceLit.slice(0, 10),
          dueDate: toDateString(r.DueDate),
          customer: r.CustomerName ?? (r.CustNum != null ? String(r.CustNum) : null),
          amount,
          balance: r.OpenInvoice ? Math.abs(toNumber(r.DocInvoiceBal) ?? 0) : 0,
          isCreditMemo: Boolean(r.CreditMemo),
        });
      }
    });
    const invoiceDates = new Map(snap.invoices.filter(i => !i.isCreditMemo).map(i => [i.id, i.date]));
    await this.step(snap, "invoiceLines", `InvoiceDate ge ${sinceLit}`, rows => {
      for (const r of rows) {
        const date = invoiceDates.get(String(r.InvoiceNum));
        if (!date) continue;
        const qty = toNumber(r.SellingShipQty) ?? 0;
        const unitCost = ["MtlUnitCost", "LbrUnitCost", "BurUnitCost", "SubUnitCost", "MtlBurUnitCost"].reduce((s, k) => s + (toNumber(r[k]) ?? 0), 0);
        snap.margin.push({ date, revenue: toNumber(r.DocExtPrice) ?? 0, cost: unitCost * qty, units: qty });
      }
    });

    // Jobs
    await this.step(snap, "jobs", `JobClosed eq false or JobCompletionDate ge ${sinceLit}`, rows => {
      for (const r of rows) {
        snap.jobs.push({
          id: String(r.JobNum),
          startDate: toDateString(r.StartDate),
          dueDate: toDateString(r.ReqDueDate ?? r.DueDate),
          completedDate: toDateString(r.JobCompletionDate),
          status: r.JobComplete || r.JobClosed ? "complete" : "open",
          qty: toNumber(r.ProdQty),
        });
      }
    });

    // Inventory: on-hand per warehouse, valued at average cost (falls back to standard)
    const unitCosts = new Map<string, number>();
    await this.step(snap, "partCosts", undefined, rows => {
      for (const r of rows) {
        const avg = ["AvgMaterialCost", "AvgLaborCost", "AvgBurdenCost", "AvgSubContCost", "AvgMtlBurCost"].reduce((s, k) => s + (toNumber(r[k]) ?? 0), 0);
        const std = ["StdMaterialCost", "StdLaborCost", "StdBurdenCost", "StdSubContCost", "StdMtlBurCost"].reduce((s, k) => s + (toNumber(r[k]) ?? 0), 0);
        const cost = avg > 0 ? avg : std;
        if (cost > 0 && !unitCosts.has(String(r.PartNum))) unitCosts.set(String(r.PartNum), cost);
      }
    });
    await this.step(snap, "partWhses", "OnHandQty ne 0", rows => {
      for (const r of rows) {
        snap.inventory.push({ item: String(r.PartNum), onHand: toNumber(r.OnHandQty) ?? 0, unitCost: unitCosts.get(String(r.PartNum)) ?? null });
      }
    });

    return snap;
  }

  /** Run one entity pull, turning failures into a snapshot warning instead of aborting the sync */
  private async step(snap: ErpSnapshot, entity: EpicorEntity, filter: string | undefined, handle: (rows: any[]) => void) {
    try {
      handle(await this.query(entity, filter));
    } catch (error) {
      snap.warnings.push(`${entity}: ${describe(error)}`);
    }
  }

  private async query(entity: EpicorEntity, filter?: string, top?: number): Promise<any[]> {
    const def = { ...DEFAULT_ENTITIES[entity], ...(this.overrides[entity] ?? {}) };
    const effectiveFilter = this.overrides[entity]?.filter ?? filter;
    const rows: any[] = [];
    const limit = top ?? this.maxRows;
    const pageSize = Math.min(this.pageSize, limit);
    for (let skip = 0; skip < limit; skip += pageSize) {
      const params = new URLSearchParams();
      params.set("$select", def.select.join(","));
      if (effectiveFilter) params.set("$filter", effectiveFilter);
      params.set("$top", String(Math.min(pageSize, limit - skip)));
      if (skip) params.set("$skip", String(skip));
      const data = await this.http.getJson<{ value?: any[] }>(`${this.base}/${def.path}?${params.toString()}`);
      const page = Array.isArray(data?.value) ? data.value : [];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return rows;
  }
}

function describe(error: unknown): string {
  if (error instanceof ErpHttpError) {
    if (error.status === 401) return "Epicor rejected the credentials (401). Check username/password or bearer token.";
    if (error.status === 403) return "Epicor refused access (403). Check the x-api-key and the user's security group / API access scope.";
    if (error.status === 404) return `Epicor endpoint not found (404): ${error.url}. Check the instance URL and company id.`;
    return `${error.message}${error.body ? ` :: ${error.body.slice(0, 200)}` : ""}`;
  }
  return (error as Error).message;
}
