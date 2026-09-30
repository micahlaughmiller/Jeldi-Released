/**
 * Native connector: turns the organization's own Jeldi Ledger rows into an ErpSnapshot, so the
 * KPI engine, charts, drill-downs and AI context work exactly as they do for Epicor or SyteLine.
 */
import { ledgerStorage, num, type LedgerSnapshotData } from "../ledger/ledgerStorage";
import { emptySnapshot, daysAgo, type ErpConnector, type ErpSnapshot, type ConnectionTestResult } from "./types";

export const NATIVE_SYSTEM = "jeldi";

export function snapshotFromLedger(organizationId: string, data: LedgerSnapshotData, now: Date = new Date(), sinceDays = 400): ErpSnapshot {
  const snap = emptySnapshot(NATIVE_SYSTEM, daysAgo(sinceDays, now));
  snap.fetchedAt = now.toISOString();
  const customerName = new Map(data.customers.map(c => [c.id, c.name]));
  const itemById = new Map(data.items.map(i => [i.id, i]));
  const orderById = new Map(data.orders.map(o => [o.id, o]));

  for (const o of data.orders) {
    const total = data.lines.filter(l => l.orderId === o.id).reduce((s, l) => s + num(l.qty) * num(l.unitPrice), 0);
    snap.salesOrders.push({
      id: o.number, orderDate: o.orderDate, customer: customerName.get(o.customerId) ?? null,
      status: o.status === "cancelled" ? "cancelled" : o.status === "closed" ? "closed" : "open",
      amount: Math.round(total * 100) / 100, requestedDate: o.requestedDate ?? null,
    });
  }

  // One delivery per line that has shipped (last ship date, total shipped) plus margin per shipment
  const shipmentsByLine = new Map<string, typeof data.shipments>();
  for (const s of data.shipments) {
    const list = shipmentsByLine.get(s.lineId) ?? [];
    list.push(s); shipmentsByLine.set(s.lineId, list);
  }
  for (const l of data.lines) {
    const ships = shipmentsByLine.get(l.id) ?? [];
    const order = orderById.get(l.orderId);
    if (!order) continue;
    if (ships.length > 0) {
      const last = ships.reduce((a, b) => (a.shipDate > b.shipDate ? a : b));
      snap.deliveries.push({
        orderId: order.number, line: String(l.lineNo), dueDate: l.dueDate ?? order.requestedDate ?? null,
        shippedDate: last.shipDate, qtyOrdered: num(l.qty), qtyShipped: ships.reduce((s, x) => s + num(x.qty), 0),
      });
      for (const s of ships) {
        const q = num(s.qty);
        snap.margin.push({ date: s.shipDate, revenue: q * num(l.unitPrice), cost: q * num(l.unitCost), units: q });
      }
    }
  }

  const paidByInvoice = new Map<string, number>();
  for (const p of data.payments) paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + num(p.amount));
  for (const inv of data.invoices) {
    const amount = Math.abs(num(inv.amount));
    const balance = inv.isCreditMemo ? 0 : Math.max(0, amount - (paidByInvoice.get(inv.id) ?? 0));
    snap.invoices.push({
      id: inv.number, date: inv.invoiceDate, dueDate: inv.dueDate ?? null, customer: customerName.get(inv.customerId) ?? null,
      amount: Math.round(amount * 100) / 100, balance: Math.round(balance * 100) / 100, isCreditMemo: inv.isCreditMemo,
    });
  }

  for (const j of data.jobs) {
    snap.jobs.push({
      id: j.number, startDate: j.startDate ?? null, dueDate: j.dueDate ?? null, completedDate: j.completedDate ?? null,
      status: j.status === "cancelled" ? "cancelled" : j.status === "complete" || j.completedDate ? "complete" : "open",
      qty: num(j.qty),
    });
  }

  for (const i of data.items) {
    if (!i.isActive && num(i.onHand) === 0) continue;
    snap.inventory.push({ item: i.sku, onHand: num(i.onHand), unitCost: num(i.unitCost) || null });
  }
  return snap;
}

export class NativeConnector implements ErpConnector {
  readonly system = NATIVE_SYSTEM;
  constructor(private readonly organizationId: string, private readonly now: () => Date = () => new Date()) {
    if (!organizationId) throw new Error("Native connector needs an organizationId");
  }
  async testConnection(): Promise<ConnectionTestResult> {
    const c = await ledgerStorage.counts(this.organizationId);
    return { success: true, message: `Jeldi Ledger: ${c.orders} orders, ${c.invoices} invoices, ${c.jobs} jobs`, details: c };
  }
  async fetchSnapshot(sinceDays = 400): Promise<ErpSnapshot> {
    const data = await ledgerStorage.snapshotData(this.organizationId);
    return snapshotFromLedger(this.organizationId, data, this.now(), sinceDays);
  }
}
