import { describe, it, expect } from "vitest";
import { computeKpis, revenue90d, unpaidInvoices, refunds30d, cancellations30d, businessMetrics, mergeSnapshots, formatMoney } from "../kpiEngine";
import { emptySnapshot, type ErpSnapshot } from "../../connectors/types";

const NOW = new Date("2026-09-18T12:00:00Z");
const d = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);

function sample(): ErpSnapshot {
  const s = emptySnapshot("test", new Date("2025-09-01"));
  s.invoices.push(
    { id: "A", date: d(5), dueDate: d(-25), customer: "Acme", amount: 10_000, balance: 10_000, isCreditMemo: false },
    { id: "B", date: d(10), dueDate: d(2), customer: "Globex", amount: 5_000, balance: 1_000, isCreditMemo: false },
    { id: "CM", date: d(3), dueDate: null, customer: "Acme", amount: 500, balance: 0, isCreditMemo: true },
    { id: "OLD", date: d(45), dueDate: d(15), customer: "Initech", amount: 8_000, balance: 0, isCreditMemo: false },
  );
  s.salesOrders.push(
    { id: "1", orderDate: d(2), customer: "Acme", status: "open", amount: 100, requestedDate: d(-10) },
    { id: "2", orderDate: d(4), customer: "Acme", status: "open", amount: 100, requestedDate: d(1) }, // late
    { id: "3", orderDate: d(6), customer: "Globex", status: "closed", amount: 100, requestedDate: null },
    { id: "4", orderDate: d(7), customer: "Globex", status: "cancelled", amount: 100, requestedDate: null },
  );
  s.deliveries.push(
    { orderId: "1", line: "1", dueDate: d(6), shippedDate: d(6), qtyOrdered: 10, qtyShipped: 10 },
    { orderId: "1", line: "2", dueDate: d(6), shippedDate: d(7), qtyOrdered: 10, qtyShipped: 8 },
    { orderId: "9", line: "1", dueDate: d(40), shippedDate: d(41), qtyOrdered: 1, qtyShipped: 1 }, // previous window, on time
  );
  s.jobs.push(
    { id: "J1", startDate: d(20), dueDate: d(8), completedDate: d(10), status: "complete", qty: 1 },
    { id: "J2", startDate: d(12), dueDate: d(3), completedDate: d(2), status: "complete", qty: 1 },
    { id: "J3", startDate: d(1), dueDate: d(-5), completedDate: null, status: "open", qty: 1 },
  );
  s.margin.push({ date: d(5), revenue: 10_000, cost: 6_000, units: 100 });
  s.inventory.push({ item: "X", onHand: 10, unitCost: 25 }, { item: "Y", onHand: 3, unitCost: null });
  return s;
}

describe("computeKpis", () => {
  it("computes every universal KPI from a snapshot", () => {
    const k = computeKpis(sample(), NOW);
    expect(k.revenue.raw).toBe(14_500);                 // 10k + 5k - 500 credit; OLD is outside 30 days
    expect(k.revenue.value).toBe("$14.5K");
    expect(k.revenue.change).toBe(81.3);                // previous window had 8k
    expect(k.orders.raw).toBe(2);
    expect(k.on_time_delivery.raw).toBe(100);           // both current-window shipments on/before due
    expect(k.inventory.raw).toBe(50);                   // 1 of 2 lines shipped complete
    expect(k.cycle_time.raw).toBe(10);                  // (10 + 10) / 2 days
    expect(k.cycle_time.value).toBe("10.0 days");
    expect(k.performance.raw).toBe(50);                 // J1 late, J2 on time
    expect(k.gross_margin.raw).toBe(40);
    expect(k.cost_per_unit.value).toBe("$60.00");
    expect(k.working_capital_efficiency.value).toBe("1.32x"); // 14.5k / 11k open AR
    expect(k.efficiency.raw).toBe(50);                  // order 2 is past its requested date
  });

  it("returns N/A rather than zeros when a snapshot has no data for a metric", () => {
    const k = computeKpis(emptySnapshot("empty", new Date()), NOW);
    for (const v of Object.values(k)) {
      expect(v.raw).toBeNull();
      expect(v.value).toBe("N/A");
      expect(v.change).toBeNull();
    }
  });
});

describe("chart series", () => {
  it("builds a 90-day revenue series with a trailing-average target", () => {
    const series = revenue90d(sample(), NOW);
    expect(series.length).toBe(90);
    expect(series[series.length - 1].date).toBe(d(0));
    expect(series.find(p => p.date === d(5))?.revenue).toBe(10_000);
    expect(series.find(p => p.date === d(3))?.revenue).toBe(-500);
    expect(series[0].target).toBeGreaterThan(0);
  });

  it("lists unpaid invoices most overdue first", () => {
    const rows = unpaidInvoices(sample(), NOW);
    expect(rows.map(r => r.invoiceId)).toEqual(["B", "A"]);
    expect(rows[0].daysOverdue).toBe(2);
    expect(rows[1].daysOverdue).toBe(0);
  });

  it("counts refunds and cancellations per day over 30 days", () => {
    const r = refunds30d(sample(), NOW);
    expect(r.length).toBe(30);
    expect(r.find(p => p.date === d(3))).toEqual({ date: d(3), refunds: 1, amount: 500 });
    const c = cancellations30d(sample(), NOW);
    expect(c.find(p => p.date === d(7))?.cancellations).toBe(1);
    expect(c.every(p => p.reason === "Cancelled in ERP")).toBe(true);
  });
});

describe("businessMetrics + mergeSnapshots", () => {
  it("values inventory only where a unit cost is known and merges systems", () => {
    const a = sample();
    const b = emptySnapshot("other", new Date("2026-01-01"));
    b.inventory.push({ item: "Z", onHand: 2, unitCost: 100 });
    b.warnings.push("jobs: nope");
    const merged = mergeSnapshots([a, b]);
    expect(merged.system).toBe("test+other");
    expect(merged.warnings).toEqual(["other: jobs: nope"]);
    const m = businessMetrics(merged, NOW);
    expect(m.inventoryValue).toBe(450);
    expect(m.totalRevenue).toBe(14_500);
    expect(m.activeOrders).toBe(2);
    expect(m.openReceivables).toBe(11_000);
  });

  it("formats money compactly", () => {
    expect(formatMoney(1_234_567)).toBe("$1.23M");
    expect(formatMoney(-2_500)).toBe("-$2.5K");
    expect(formatMoney(12.5)).toBe("$12.50");
    expect(formatMoney(null)).toBe("N/A");
  });
});
