/**
 * Turns one or more ErpSnapshots into the KPI values, chart series and analytics numbers
 * the dashboard shows. Pure functions: no I/O, so they are easy to unit test.
 *
 * Windows: "current" = last 30 days ending at `now`, "previous" = the 30 days before that.
 * `change` is the percentage move from previous to current, or null when undefined.
 */
import type { ErpSnapshot, Invoice, Delivery, Job, SalesOrder, MarginSample } from "../connectors/types";

export const KPI_TYPES = [
  "revenue", "orders", "on_time_delivery", "cycle_time", "inventory",
  "gross_margin", "cost_per_unit", "working_capital_efficiency", "performance", "efficiency",
] as const;
export type KpiType = (typeof KPI_TYPES)[number];

export interface KpiValue {
  type: KpiType;
  /** Raw numeric value in natural units (currency, %, days, count, ratio) */
  raw: number | null;
  /** Display string, e.g. "$1.2M", "94.2%", "3.4 days" */
  value: string;
  /** Percent change vs the previous window; null when not computable */
  change: number | null;
  /** Human explanation of what was computed, shown in tooltips */
  basis: string;
}

export interface KpiWindow {
  start: Date;
  end: Date;
}

export function mergeSnapshots(snapshots: ErpSnapshot[]): ErpSnapshot {
  const merged: ErpSnapshot = {
    system: snapshots.map(s => s.system).join("+") || "none",
    fetchedAt: snapshots.reduce((latest, s) => (s.fetchedAt > latest ? s.fetchedAt : latest), ""),
    since: snapshots.reduce((earliest, s) => (!earliest || s.since < earliest ? s.since : earliest), ""),
    salesOrders: [], deliveries: [], invoices: [], jobs: [], inventory: [], margin: [], warnings: [],
  };
  for (const s of snapshots) {
    merged.salesOrders.push(...s.salesOrders);
    merged.deliveries.push(...s.deliveries);
    merged.invoices.push(...s.invoices);
    merged.jobs.push(...s.jobs);
    merged.inventory.push(...s.inventory);
    merged.margin.push(...s.margin);
    merged.warnings.push(...s.warnings.map(w => `${s.system}: ${w}`));
  }
  return merged;
}

const DAY = 86_400_000;
export function windows(now: Date, days = 30): { current: KpiWindow; previous: KpiWindow } {
  const end = new Date(now);
  const start = new Date(end.getTime() - days * DAY);
  return { current: { start, end }, previous: { start: new Date(start.getTime() - days * DAY), end: start } };
}
function inWindow(date: string | null, w: KpiWindow): boolean {
  if (!date) return false;
  const t = new Date(date).getTime();
  return t >= w.start.getTime() && t < w.end.getTime();
}
function pctChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return round(((current - previous) / Math.abs(previous)) * 100, 1);
}
function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// ---- individual metrics -------------------------------------------------------------------

export function netRevenue(invoices: Invoice[], w: KpiWindow): number {
  return invoices.filter(i => inWindow(i.date, w)).reduce((s, i) => s + (i.isCreditMemo ? -i.amount : i.amount), 0);
}
export function openOrders(orders: SalesOrder[]): number {
  return orders.filter(o => o.status === "open").length;
}
export function onTimeRate(deliveries: Delivery[], w: KpiWindow): { rate: number | null; n: number } {
  const shipped = deliveries.filter(d => d.shippedDate && d.dueDate && inWindow(d.shippedDate, w));
  if (shipped.length === 0) return { rate: null, n: 0 };
  const onTime = shipped.filter(d => new Date(d.shippedDate!).getTime() <= new Date(d.dueDate!).getTime()).length;
  return { rate: round((onTime / shipped.length) * 100), n: shipped.length };
}
export function fillRate(deliveries: Delivery[], w: KpiWindow): { rate: number | null; n: number } {
  const shipped = deliveries.filter(d => d.shippedDate && d.qtyOrdered != null && d.qtyOrdered > 0 && d.qtyShipped != null && inWindow(d.shippedDate, w));
  if (shipped.length === 0) return { rate: null, n: 0 };
  const full = shipped.filter(d => d.qtyShipped! >= d.qtyOrdered!).length;
  return { rate: round((full / shipped.length) * 100), n: shipped.length };
}
export function avgCycleDays(jobs: Job[], w: KpiWindow): { days: number | null; n: number } {
  const done = jobs.filter(j => j.completedDate && j.startDate && inWindow(j.completedDate, w));
  if (done.length === 0) return { days: null, n: 0 };
  const total = done.reduce((s, j) => s + Math.max(0, (new Date(j.completedDate!).getTime() - new Date(j.startDate!).getTime()) / DAY), 0);
  return { days: round(total / done.length), n: done.length };
}
export function jobsOnTime(jobs: Job[], w: KpiWindow): { rate: number | null; n: number } {
  const done = jobs.filter(j => j.completedDate && j.dueDate && inWindow(j.completedDate, w));
  if (done.length === 0) return { rate: null, n: 0 };
  const onTime = done.filter(j => new Date(j.completedDate!).getTime() <= new Date(j.dueDate!).getTime()).length;
  return { rate: round((onTime / done.length) * 100), n: done.length };
}
export function inventoryValue(snapshot: ErpSnapshot): { value: number; valuedItems: number; totalItems: number } {
  let value = 0, valued = 0;
  for (const i of snapshot.inventory) {
    if (i.unitCost != null) { value += i.onHand * i.unitCost; valued++; }
  }
  return { value, valuedItems: valued, totalItems: snapshot.inventory.length };
}
export function marginTotals(margin: MarginSample[], w: KpiWindow): { revenue: number; cost: number; units: number } {
  return margin.filter(m => inWindow(m.date, w)).reduce((acc, m) => ({ revenue: acc.revenue + m.revenue, cost: acc.cost + m.cost, units: acc.units + m.units }), { revenue: 0, cost: 0, units: 0 });
}
export function openReceivables(invoices: Invoice[]): number {
  return invoices.filter(i => !i.isCreditMemo).reduce((s, i) => s + i.balance, 0);
}
/** Share of open orders whose requested date has not passed */
export function ordersNotLate(orders: SalesOrder[], now: Date): { rate: number | null; n: number } {
  const open = orders.filter(o => o.status === "open" && o.requestedDate);
  if (open.length === 0) return { rate: null, n: 0 };
  const late = open.filter(o => new Date(o.requestedDate!).getTime() < now.getTime()).length;
  return { rate: round(((open.length - late) / open.length) * 100), n: open.length };
}

// ---- formatting ---------------------------------------------------------------------------

export function formatMoney(n: number | null): string {
  if (n == null) return "N/A";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}
const fmtPct = (n: number | null) => (n == null ? "N/A" : `${n.toFixed(1)}%`);
const fmtDays = (n: number | null) => (n == null ? "N/A" : `${n.toFixed(1)} days`);
const fmtCount = (n: number | null) => (n == null ? "N/A" : n.toLocaleString("en-US"));

// ---- the KPI set --------------------------------------------------------------------------

export function computeKpis(snapshot: ErpSnapshot, now: Date = new Date()): Record<KpiType, KpiValue> {
  const { current, previous } = windows(now);

  const revNow = netRevenue(snapshot.invoices, current);
  const revPrev = netRevenue(snapshot.invoices, previous);
  const hasInvoices = snapshot.invoices.length > 0;

  const otdNow = onTimeRate(snapshot.deliveries, current);
  const otdPrev = onTimeRate(snapshot.deliveries, previous);
  const fillNow = fillRate(snapshot.deliveries, current);
  const fillPrev = fillRate(snapshot.deliveries, previous);
  const cycleNow = avgCycleDays(snapshot.jobs, current);
  const cyclePrev = avgCycleDays(snapshot.jobs, previous);
  const perfNow = jobsOnTime(snapshot.jobs, current);
  const perfPrev = jobsOnTime(snapshot.jobs, previous);
  const mNow = marginTotals(snapshot.margin, current);
  const mPrev = marginTotals(snapshot.margin, previous);
  const gmNow = mNow.revenue > 0 ? round(((mNow.revenue - mNow.cost) / mNow.revenue) * 100) : null;
  const gmPrev = mPrev.revenue > 0 ? round(((mPrev.revenue - mPrev.cost) / mPrev.revenue) * 100) : null;
  const cpuNow = mNow.units > 0 ? round(mNow.cost / mNow.units, 2) : null;
  const cpuPrev = mPrev.units > 0 ? round(mPrev.cost / mPrev.units, 2) : null;
  const ar = openReceivables(snapshot.invoices);
  const wce = ar > 0 && revNow > 0 ? round(revNow / ar, 2) : null;
  const orders = openOrders(snapshot.salesOrders);
  const eff = ordersNotLate(snapshot.salesOrders, now);

  return {
    revenue: { type: "revenue", raw: hasInvoices ? revNow : null, value: hasInvoices ? formatMoney(revNow) : "N/A", change: pctChange(revNow, revPrev), basis: "Invoices net of credit memos, last 30 days" },
    orders: { type: "orders", raw: snapshot.salesOrders.length ? orders : null, value: snapshot.salesOrders.length ? fmtCount(orders) : "N/A", change: null, basis: "Sales orders currently open" },
    on_time_delivery: { type: "on_time_delivery", raw: otdNow.rate, value: fmtPct(otdNow.rate), change: pctChange(otdNow.rate, otdPrev.rate), basis: `Shipments on or before the promised date, last 30 days (${otdNow.n} shipments)` },
    cycle_time: { type: "cycle_time", raw: cycleNow.days, value: fmtDays(cycleNow.days), change: pctChange(cycleNow.days, cyclePrev.days), basis: `Average job start to completion, jobs completed in the last 30 days (${cycleNow.n} jobs)` },
    inventory: { type: "inventory", raw: fillNow.rate, value: fmtPct(fillNow.rate), change: pctChange(fillNow.rate, fillPrev.rate), basis: `Order lines shipped complete, last 30 days (${fillNow.n} lines)` },
    gross_margin: { type: "gross_margin", raw: gmNow, value: fmtPct(gmNow), change: pctChange(gmNow, gmPrev), basis: "(Revenue - cost of shipped lines) / revenue, last 30 days" },
    cost_per_unit: { type: "cost_per_unit", raw: cpuNow, value: cpuNow == null ? "N/A" : `$${cpuNow.toFixed(2)}`, change: pctChange(cpuNow, cpuPrev), basis: `Cost of shipped lines / units shipped, last 30 days (${mNow.units} units)` },
    working_capital_efficiency: { type: "working_capital_efficiency", raw: wce, value: wce == null ? "N/A" : `${wce.toFixed(2)}x`, change: null, basis: "30-day revenue / open receivables" },
    performance: { type: "performance", raw: perfNow.rate, value: fmtPct(perfNow.rate), change: pctChange(perfNow.rate, perfPrev.rate), basis: `Jobs completed by their due date, last 30 days (${perfNow.n} jobs)` },
    efficiency: { type: "efficiency", raw: eff.rate, value: fmtPct(eff.rate), change: null, basis: `Open orders not past their requested date (${eff.n} orders)` },
  };
}

// ---- chart series (shapes match the existing /api/charts/* endpoints) ----------------------

export function revenue90d(snapshot: ErpSnapshot, now: Date = new Date()): Array<{ date: string; revenue: number; target: number }> {
  const days = 90;
  const start = new Date(now.getTime() - (days - 1) * DAY);
  const byDay = new Map<string, number>();
  for (let i = 0; i < days; i++) byDay.set(new Date(start.getTime() + i * DAY).toISOString().slice(0, 10), 0);
  for (const inv of snapshot.invoices) {
    if (!byDay.has(inv.date)) continue;
    byDay.set(inv.date, byDay.get(inv.date)! + (inv.isCreditMemo ? -inv.amount : inv.amount));
  }
  const values = Array.from(byDay.values());
  const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  const target = round(avg, 2); // trailing daily average until customers define a plan
  return Array.from(byDay.entries()).map(([date, revenue]) => ({ date, revenue: round(revenue, 2), target }));
}

export function unpaidInvoices(snapshot: ErpSnapshot, now: Date = new Date(), limit = 25): Array<{ invoiceId: string; customer: string; amount: number; dueDate: string; daysOverdue: number }> {
  return snapshot.invoices
    .filter(i => !i.isCreditMemo && i.balance > 0)
    .map(i => ({
      invoiceId: i.id,
      customer: i.customer ?? "Unknown",
      amount: round(i.balance, 2),
      dueDate: i.dueDate ?? i.date,
      daysOverdue: i.dueDate ? Math.max(0, Math.floor((now.getTime() - new Date(i.dueDate).getTime()) / DAY)) : 0,
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.amount - a.amount)
    .slice(0, limit);
}

export function refunds30d(snapshot: ErpSnapshot, now: Date = new Date()): Array<{ date: string; refunds: number; amount: number }> {
  return dailySeries(now, 30, snapshot.invoices.filter(i => i.isCreditMemo).map(i => ({ date: i.date, amount: i.amount })), "refunds")
    .map(s => ({ date: s.date, refunds: s.refunds as number, amount: s.amount }));
}

export function cancellations30d(snapshot: ErpSnapshot, now: Date = new Date()): Array<{ date: string; cancellations: number; reason: string }> {
  const series = dailySeries(now, 30, snapshot.salesOrders.filter(o => o.status === "cancelled").map(o => ({ date: o.orderDate, amount: o.amount ?? 0 })), "cancellations");
  return series.map(s => ({ date: s.date, cancellations: (s as any).cancellations as number, reason: "Cancelled in ERP" }));
}

function dailySeries(now: Date, days: number, items: Array<{ date: string; amount: number }>, countKey: string): Array<{ date: string; amount: number } & Record<string, number | string>> {
  const start = new Date(now.getTime() - (days - 1) * DAY);
  const byDay = new Map<string, { count: number; amount: number }>();
  for (let i = 0; i < days; i++) byDay.set(new Date(start.getTime() + i * DAY).toISOString().slice(0, 10), { count: 0, amount: 0 });
  for (const it of items) {
    const b = byDay.get(it.date);
    if (b) { b.count++; b.amount += it.amount; }
  }
  return Array.from(byDay.entries()).map(([date, b]) => ({ date, [countKey]: b.count, amount: round(b.amount, 2) }));
}

/** Monthly net revenue for the analytics page (shape matches the previous synthetic series) */
export function monthlyRevenue(snapshot: ErpSnapshot, months: number, now: Date = new Date()): Array<{ period: string; revenue: number; target: number; previousYear: number }> {
  const byMonth = new Map<string, number>();
  for (const inv of snapshot.invoices) {
    const key = inv.date.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + (inv.isCreditMemo ? -inv.amount : inv.amount));
  }
  const out: Array<{ period: string; revenue: number; target: number; previousYear: number }> = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const period = d.toISOString().slice(0, 7);
    const prev = new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), 1)).toISOString().slice(0, 7);
    out.push({ period, revenue: round(byMonth.get(period) ?? 0, 2), target: 0, previousYear: round(byMonth.get(prev) ?? 0, 2) });
  }
  // target = trailing average of the months that have data, until customers supply a plan
  const withData = out.filter(m => m.revenue !== 0);
  const avg = withData.length ? withData.reduce((s, m) => s + m.revenue, 0) / withData.length : 0;
  return out.map(m => ({ ...m, target: round(avg, 2) }));
}

/**
 * Compact, LLM-friendly summary of a snapshot: what the AI assistant and /api/erp/data expose
 * for a connector-backed system instead of raw rows.
 */
export function summarizeSnapshot(snapshot: ErpSnapshot, now: Date = new Date()) {
  const kpis = computeKpis(snapshot, now);
  const { current } = windows(now, 90);
  const byCustomer = new Map<string, number>();
  for (const inv of snapshot.invoices) {
    if (inv.isCreditMemo || !inWindow(inv.date, current)) continue;
    const key = inv.customer ?? "Unknown";
    byCustomer.set(key, (byCustomer.get(key) ?? 0) + inv.amount);
  }
  const topCustomers90d = Array.from(byCustomer.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([customer, revenue]) => ({ customer, revenue: round(revenue, 2) }));
  return {
    source: "snapshot",
    system: snapshot.system,
    asOf: snapshot.fetchedAt,
    kpis: Object.fromEntries(Object.values(kpis).map(k => [k.type, { value: k.value, change: k.change, basis: k.basis }])),
    metrics: businessMetrics(snapshot, now),
    topCustomers90d,
    overdueInvoices: unpaidInvoices(snapshot, now, 10).filter(i => i.daysOverdue > 0),
    counts: {
      salesOrders: snapshot.salesOrders.length,
      openOrders: openOrders(snapshot.salesOrders),
      deliveries: snapshot.deliveries.length,
      invoices: snapshot.invoices.length,
      jobs: snapshot.jobs.length,
      inventoryItems: snapshot.inventory.length,
    },
    warnings: snapshot.warnings,
  };
}

// ---- analytics overview numbers -----------------------------------------------------------

export function businessMetrics(snapshot: ErpSnapshot, now: Date = new Date()) {
  const kpis = computeKpis(snapshot, now);
  const inv = inventoryValue(snapshot);
  return {
    totalRevenue: round(kpis.revenue.raw ?? 0, 2),
    monthlyGrowth: kpis.revenue.change ?? 0,
    activeOrders: kpis.orders.raw ?? 0,
    inventoryValue: round(inv.value, 2),
    systemPerformance: kpis.performance.raw ?? 0,
    openReceivables: round(openReceivables(snapshot.invoices), 2),
    dataAsOf: snapshot.fetchedAt || null,
    warnings: snapshot.warnings,
  };
}
