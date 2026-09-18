/**
 * Canonical data model every ERP connector normalises into.
 *
 * The KPI engine, charts and analytics only ever read an ErpSnapshot, so adding a new ERP
 * means writing one connector that fills these arrays. Dates are ISO strings (YYYY-MM-DD or
 * full ISO); amounts are in the ERP's document currency and are not converted.
 */

export type OrderStatus = "open" | "closed" | "cancelled";
export type JobStatus = "open" | "complete" | "cancelled";

export interface SalesOrder {
  id: string;
  orderDate: string;
  customer: string | null;
  status: OrderStatus;
  /** Total order value; null when the ERP did not return it */
  amount: number | null;
  /** Customer requested / need-by date for the order as a whole, if any */
  requestedDate: string | null;
}

/** One shipped order release/line, used for on-time delivery and fill rate */
export interface Delivery {
  orderId: string;
  line: string;
  dueDate: string | null;
  shippedDate: string | null;
  qtyOrdered: number | null;
  qtyShipped: number | null;
}

export interface Invoice {
  id: string;
  date: string;
  dueDate: string | null;
  customer: string | null;
  /** Gross document amount (positive for credit memos too) */
  amount: number;
  /** Remaining open balance */
  balance: number;
  isCreditMemo: boolean;
}

export interface Job {
  id: string;
  startDate: string | null;
  dueDate: string | null;
  completedDate: string | null;
  status: JobStatus;
  qty: number | null;
}

export interface InventoryItem {
  item: string;
  onHand: number;
  unitCost: number | null;
}

/** Revenue and cost over the same shipped lines, for margin and cost-per-unit */
export interface MarginSample {
  date: string;
  revenue: number;
  cost: number;
  units: number;
}

export interface ErpSnapshot {
  system: string;
  fetchedAt: string;
  /** How far back the connector pulled transactional history */
  since: string;
  salesOrders: SalesOrder[];
  deliveries: Delivery[];
  invoices: Invoice[];
  jobs: Job[];
  inventory: InventoryItem[];
  margin: MarginSample[];
  /** Non-fatal problems: an entity the account could not read, a field that was missing, etc. */
  warnings: string[];
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface ErpConnector {
  readonly system: string;
  /** Cheap authenticated request that proves the credentials and URL work */
  testConnection(): Promise<ConnectionTestResult>;
  /** Pull everything the KPI engine needs, going back `sinceDays` days */
  fetchSnapshot(sinceDays?: number): Promise<ErpSnapshot>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function emptySnapshot(system: string, since: Date): ErpSnapshot {
  return {
    system,
    fetchedAt: new Date().toISOString(),
    since: since.toISOString(),
    salesOrders: [],
    deliveries: [],
    invoices: [],
    jobs: [],
    inventory: [],
    margin: [],
    warnings: [],
  };
}

export function daysAgo(days: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** YYYY-MM-DD, or null for anything unparsable. Accepts Date, ISO strings and OData date literals. */
export function toDateString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
