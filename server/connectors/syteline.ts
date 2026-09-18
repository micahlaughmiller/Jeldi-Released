/**
 * Infor SyteLine / CloudSuite Industrial (CSI) connector via the Mongoose IDO REST service.
 *
 *   GET {idoBaseUrl}/ido/load/{IDO}?properties=A,B&filter=...&recordCap=N&orderBy=...
 *   -> { Items: [ { A: "...", B: "..." } ], MoreRowsExist: bool }
 *
 * Two deployment styles are supported:
 *  - "ionapi"  CloudSuite through the Infor ION API gateway. `idoBaseUrl` is the gateway URL for
 *              the CSI IDORequestService (…/{TENANT}/{CSI_SUITE}/IDORequestService). Tokens come
 *              from the tenant's OAuth2 endpoint with the "Backend service" credentials in the
 *              .ionapi file: client id (ci), client secret (cs), service account key (saak) and
 *              secret (sask). The Mongoose configuration name goes in X-Infor-MongooseConfig.
 *  - "onprem"  Self-hosted SyteLine. `idoBaseUrl` is https://server/IDORequestService and a
 *              Mongoose token is obtained from /ido/token/{config}/{user}/{password}.
 *
 * IDO and property names are the stock SyteLine ones and can be overridden per tenant through
 * `config.overrides` for sites with custom IDO extensions.
 */
import { HttpClient, ErpHttpError } from "./http";
import {
  type ErpConnector, type ErpSnapshot, type ConnectionTestResult, type FetchLike,
  emptySnapshot, daysAgo, toDateString, toNumber,
} from "./types";

export type SyteLineAuthMode = "ionapi" | "onprem";

export interface SyteLineCredentials {
  authMode: SyteLineAuthMode;
  /** …/IDORequestService (with or without trailing slash) */
  idoBaseUrl: string;
  /** Mongoose configuration name, e.g. "SL_Prod" */
  configName: string;
  // ionapi
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  serviceAccountKey?: string;
  serviceAccountSecret?: string;
  // onprem
  username?: string;
  password?: string;
}

export type SyteLineEntity = "customerOrders" | "orderLines" | "shipments" | "arTransactions" | "jobs" | "itemWarehouses" | "items";

export interface SyteLineOptions {
  fetchImpl?: FetchLike;
  maxRows?: number;
  overrides?: Partial<Record<SyteLineEntity, { ido?: string; properties?: string[]; filter?: string }>>;
  now?: () => Date;
}

const DEFAULT_IDOS: Record<SyteLineEntity, { ido: string; properties: string[]; orderBy?: string }> = {
  customerOrders: { ido: "SLCos",        properties: ["CoNum", "OrderDate", "Stat", "CustNum", "CustSeq", "Price"], orderBy: "OrderDate DESC" },
  orderLines:     { ido: "SLCoitems",    properties: ["CoNum", "CoLine", "CoRelease", "Item", "QtyOrdered", "QtyShipped", "Price", "Cost", "DueDate", "PromiseDate", "Stat"], orderBy: "DueDate DESC" },
  shipments:      { ido: "SLCoShipments", properties: ["CoNum", "CoLine", "CoRelease", "ShipDate", "QtyShipped", "QtyInvoiced"], orderBy: "ShipDate DESC" },
  arTransactions: { ido: "SLArtrans",    properties: ["TransNum", "InvNum", "CustNum", "Type", "InvDate", "DueDate", "Amount", "ApplyToInvNum"], orderBy: "InvDate DESC" },
  jobs:           { ido: "SLJobs",       properties: ["Job", "Suffix", "Stat", "JobDate", "StartDate", "EndDate", "CompleteDate", "Item", "QtyReleased", "QtyComplete"], orderBy: "JobDate DESC" },
  itemWarehouses: { ido: "SLItemwhses",  properties: ["Item", "Whse", "QtyOnHand"] },
  items:          { ido: "SLItems",      properties: ["Item", "UnitCost", "Stat"] },
};

export class SyteLineConnector implements ErpConnector {
  readonly system = "syteline";
  private readonly http: HttpClient;
  private readonly base: string;
  private readonly maxRows: number;
  private readonly overrides: NonNullable<SyteLineOptions["overrides"]>;
  private readonly now: () => Date;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly creds: SyteLineCredentials, options: SyteLineOptions = {}) {
    if (!creds.idoBaseUrl || !creds.configName) {
      throw new Error("SyteLine connection needs idoBaseUrl and configName");
    }
    if (creds.authMode === "ionapi") {
      for (const k of ["tokenUrl", "clientId", "clientSecret", "serviceAccountKey", "serviceAccountSecret"] as const) {
        if (!creds[k]) throw new Error(`SyteLine ION API connection needs ${k}`);
      }
    } else if (creds.authMode === "onprem") {
      if (!creds.username || !creds.password) throw new Error("SyteLine on-prem connection needs username and password");
    } else {
      throw new Error(`Unknown SyteLine authMode: ${String((creds as any).authMode)}`);
    }
    this.http = new HttpClient({ fetchImpl: options.fetchImpl, headers: { "X-Infor-MongooseConfig": creds.configName } });
    this.base = creds.idoBaseUrl.replace(/\/+$/, "");
    this.maxRows = options.maxRows ?? 20_000;
    this.overrides = options.overrides ?? {};
    this.now = options.now ?? (() => new Date());
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      await this.ensureToken();
      const rows = await this.load("customerOrders", undefined, 1);
      return {
        success: true,
        message: rows.length ? `Connected to SyteLine configuration ${this.creds.configName}` : `Connected to SyteLine configuration ${this.creds.configName}; no customer orders visible to this account`,
        details: { configName: this.creds.configName, authMode: this.creds.authMode },
      };
    } catch (error) {
      return { success: false, message: describe(error) };
    }
  }

  async fetchSnapshot(sinceDays = 400): Promise<ErpSnapshot> {
    const since = daysAgo(sinceDays, this.now());
    const snap = emptySnapshot(this.system, since);
    const sinceSql = `'${since.toISOString().slice(0, 10)}'`;

    await this.step(snap, "customerOrders", `OrderDate >= ${sinceSql} OR Stat IN ('O','P')`, rows => {
      for (const r of rows) {
        snap.salesOrders.push({
          id: String(r.CoNum),
          orderDate: toDateString(r.OrderDate) ?? since.toISOString().slice(0, 10),
          customer: r.CustNum != null ? String(r.CustNum).trim() : null,
          status: statusFromCo(r.Stat),
          amount: toNumber(r.Price),
          requestedDate: null,
        });
      }
    });

    // Order lines carry due dates, unit price and unit cost; shipments carry the actual ship date
    const lines = new Map<string, { due: string | null; qtyOrdered: number | null; qtyShipped: number | null; price: number | null; cost: number | null }>();
    await this.step(snap, "orderLines", `DueDate >= ${sinceSql} OR Stat IN ('O','P')`, rows => {
      for (const r of rows) {
        lines.set(`${r.CoNum}/${r.CoLine}/${r.CoRelease ?? 0}`, {
          due: toDateString(r.DueDate ?? r.PromiseDate),
          qtyOrdered: toNumber(r.QtyOrdered), qtyShipped: toNumber(r.QtyShipped),
          price: toNumber(r.Price), cost: toNumber(r.Cost),
        });
      }
    });
    await this.step(snap, "shipments", `ShipDate >= ${sinceSql}`, rows => {
      for (const r of rows) {
        const line = lines.get(`${r.CoNum}/${r.CoLine}/${r.CoRelease ?? 0}`);
        const qty = toNumber(r.QtyShipped) ?? 0;
        const shipped = toDateString(r.ShipDate);
        snap.deliveries.push({
          orderId: String(r.CoNum), line: `${r.CoLine}/${r.CoRelease ?? 0}`,
          dueDate: line?.due ?? null, shippedDate: shipped,
          qtyOrdered: line?.qtyOrdered ?? null, qtyShipped: qty,
        });
        if (line && shipped && line.price != null) {
          snap.margin.push({ date: shipped, revenue: line.price * qty, cost: (line.cost ?? 0) * qty, units: qty });
        }
      }
    });

    // AR: invoices (I) and debit memos (D) are documents; payments (P) and credits (C) apply against them
    await this.step(snap, "arTransactions", `InvDate >= ${sinceSql} OR Type IN ('I','D')`, rows => {
      const docs = new Map<string, { id: string; date: string; dueDate: string | null; customer: string | null; amount: number; applied: number; isCreditMemo: boolean }>();
      const applied = new Map<string, number>();
      for (const r of rows) {
        const type = String(r.Type ?? "").trim().toUpperCase();
        const amount = toNumber(r.Amount) ?? 0;
        const invNum = r.InvNum != null ? String(r.InvNum) : null;
        if (type === "I" || type === "D") {
          if (!invNum) continue;
          docs.set(invNum, {
            id: invNum, date: toDateString(r.InvDate) ?? since.toISOString().slice(0, 10), dueDate: toDateString(r.DueDate),
            customer: r.CustNum != null ? String(r.CustNum).trim() : null, amount: Math.abs(amount), applied: 0, isCreditMemo: false,
          });
        } else if (type === "C") {
          snap.invoices.push({
            id: invNum ?? String(r.TransNum), date: toDateString(r.InvDate) ?? since.toISOString().slice(0, 10), dueDate: null,
            customer: r.CustNum != null ? String(r.CustNum).trim() : null, amount: Math.abs(amount), balance: 0, isCreditMemo: true,
          });
          const target = r.ApplyToInvNum != null ? String(r.ApplyToInvNum) : null;
          if (target) applied.set(target, (applied.get(target) ?? 0) + Math.abs(amount));
        } else if (type === "P") {
          const target = r.ApplyToInvNum != null ? String(r.ApplyToInvNum) : null;
          if (target) applied.set(target, (applied.get(target) ?? 0) + Math.abs(amount));
        }
      }
      for (const doc of docs.values()) {
        const balance = Math.max(0, doc.amount - (applied.get(doc.id) ?? 0));
        snap.invoices.push({ id: doc.id, date: doc.date, dueDate: doc.dueDate, customer: doc.customer, amount: doc.amount, balance, isCreditMemo: false });
      }
    });

    await this.step(snap, "jobs", `JobDate >= ${sinceSql} OR Stat IN ('F','R','S')`, rows => {
      for (const r of rows) {
        const stat = String(r.Stat ?? "").trim().toUpperCase();
        snap.jobs.push({
          id: `${r.Job}${r.Suffix != null && Number(r.Suffix) !== 0 ? `-${r.Suffix}` : ""}`,
          startDate: toDateString(r.StartDate ?? r.JobDate),
          dueDate: toDateString(r.EndDate),
          completedDate: toDateString(r.CompleteDate),
          status: stat === "C" || stat === "H" ? "complete" : "open",
          qty: toNumber(r.QtyReleased),
        });
      }
    });

    const unitCosts = new Map<string, number>();
    await this.step(snap, "items", undefined, rows => {
      for (const r of rows) {
        const c = toNumber(r.UnitCost);
        if (c != null) unitCosts.set(String(r.Item).trim(), c);
      }
    });
    await this.step(snap, "itemWarehouses", "QtyOnHand <> 0", rows => {
      for (const r of rows) {
        const item = String(r.Item).trim();
        snap.inventory.push({ item, onHand: toNumber(r.QtyOnHand) ?? 0, unitCost: unitCosts.get(item) ?? null });
      }
    });

    return snap;
  }

  private async step(snap: ErpSnapshot, entity: SyteLineEntity, filter: string | undefined, handle: (rows: any[]) => void) {
    try {
      handle(await this.load(entity, filter));
    } catch (error) {
      snap.warnings.push(`${entity}: ${describe(error)}`);
    }
  }

  private async load(entity: SyteLineEntity, filter: string | undefined, cap?: number): Promise<any[]> {
    await this.ensureToken();
    const def = { ...DEFAULT_IDOS[entity], ...(this.overrides[entity] ?? {}) };
    const params = new URLSearchParams();
    params.set("properties", def.properties.join(","));
    const effectiveFilter = this.overrides[entity]?.filter ?? filter;
    if (effectiveFilter) params.set("filter", effectiveFilter);
    if (def.orderBy) params.set("orderBy", def.orderBy);
    params.set("recordCap", String(cap ?? this.maxRows));
    const data = await this.http.getJson<{ Items?: any[]; Message?: string; Success?: boolean }>(`${this.base}/ido/load/${def.ido}?${params.toString()}`);
    if (data && data.Success === false) {
      throw new Error(data.Message || `IDO load of ${def.ido} failed`);
    }
    return Array.isArray(data?.Items) ? data.Items : [];
  }

  /** Obtain / refresh the bearer or Mongoose token. Tokens are refreshed 60s before expiry. */
  private async ensureToken(): Promise<void> {
    if (this.token && this.token.expiresAt - 60_000 > this.now().getTime()) return;
    if (this.creds.authMode === "ionapi") {
      const anon = new HttpClient({ fetchImpl: (this.http as any).fetchImpl });
      const data = await anon.postForm<{ access_token: string; expires_in?: number }>(this.creds.tokenUrl!, {
        grant_type: "password",
        username: this.creds.serviceAccountKey!,
        password: this.creds.serviceAccountSecret!,
        client_id: this.creds.clientId!,
        client_secret: this.creds.clientSecret!,
        scope: "openid",
      });
      if (!data?.access_token) throw new Error("ION API token endpoint returned no access_token");
      this.token = { value: data.access_token, expiresAt: this.now().getTime() + (data.expires_in ?? 7200) * 1000 };
      this.http.setHeader("Authorization", `Bearer ${this.token.value}`);
    } else {
      const url = `${this.base}/ido/token/${encodeURIComponent(this.creds.configName)}/${encodeURIComponent(this.creds.username!)}/${encodeURIComponent(this.creds.password!)}`;
      const data = await this.http.getJson<{ Token?: string; Success?: boolean; Message?: string }>(url);
      if (!data?.Token) throw new Error(data?.Message || "SyteLine token endpoint returned no Token");
      // Mongoose tokens live for the IDO service's configured session length; refresh hourly
      this.token = { value: data.Token, expiresAt: this.now().getTime() + 60 * 60 * 1000 };
      this.http.setHeader("Authorization", this.token.value);
    }
  }
}

function statusFromCo(stat: unknown): "open" | "closed" | "cancelled" {
  const s = String(stat ?? "").trim().toUpperCase();
  if (s === "O" || s === "P") return "open";
  if (s === "X") return "cancelled";
  return "closed"; // C = complete, H = history
}

function describe(error: unknown): string {
  if (error instanceof ErpHttpError) {
    if (error.status === 401) return "SyteLine rejected the credentials (401). Check the service account / user and the Mongoose configuration name.";
    if (error.status === 403) return "SyteLine refused access (403). Check the ION API authorised app and the user's IDO permissions.";
    if (error.status === 404) return `SyteLine endpoint not found (404): ${error.url}. Check the IDORequestService URL.`;
    return `${error.message}${error.body ? ` :: ${error.body.slice(0, 200)}` : ""}`;
  }
  return (error as Error).message;
}
