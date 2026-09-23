import { describe, it, expect } from "vitest";
import { generateMortonSnapshot } from "../demoCompany";
import { computeKpis, revenue90d, unpaidInvoices, businessMetrics } from "../kpiEngine";
import { DemoConnector } from "../../connectors/demo";

const NOW = new Date("2026-09-23T15:00:00Z");

describe("Morton Industries demo dataset", () => {
  it("is deterministic for the same seed and different for another", () => {
    const a = generateMortonSnapshot({ now: NOW, historyDays: 120 });
    const b = generateMortonSnapshot({ now: NOW, historyDays: 120 });
    const c = generateMortonSnapshot({ now: NOW, historyDays: 120, seed: 7 });
    expect(JSON.stringify(a.salesOrders)).toBe(JSON.stringify(b.salesOrders));
    expect(a.salesOrders[0].customer === c.salesOrders[0].customer && a.salesOrders[0].amount === c.salesOrders[0].amount).toBe(false);
  });

  it("looks like a real job shop: every KPI has a value in a plausible range", () => {
    const snap = generateMortonSnapshot({ now: NOW, historyDays: 400 });
    expect(snap.salesOrders.length).toBeGreaterThan(1000);
    expect(snap.invoices.some(i => i.isCreditMemo)).toBe(true);
    expect(snap.salesOrders.some(o => o.status === "cancelled")).toBe(true);
    expect(snap.inventory.length).toBe(40);
    // nothing is dated in the future
    for (const d of snap.deliveries) expect(new Date(d.shippedDate!).getTime()).toBeLessThanOrEqual(NOW.getTime());
    for (const j of snap.jobs) if (j.completedDate) expect(new Date(j.completedDate).getTime()).toBeLessThanOrEqual(NOW.getTime());

    const k = computeKpis(snap, NOW);
    for (const v of Object.values(k)) expect(v.raw, v.type).not.toBeNull();
    expect(k.on_time_delivery.raw!).toBeGreaterThan(80);
    expect(k.on_time_delivery.raw!).toBeLessThanOrEqual(100);
    expect(k.gross_margin.raw!).toBeGreaterThan(25);
    expect(k.gross_margin.raw!).toBeLessThan(50);
    expect(k.revenue.raw!).toBeGreaterThan(500_000);   // ~30 days of a ~$25M/yr shop
    expect(k.cycle_time.raw!).toBeGreaterThan(2);
    expect(k.orders.raw!).toBeGreaterThan(10);
    expect(k.inventory.raw!).toBeGreaterThan(85);        // fill rate

    const rev = revenue90d(snap, NOW);
    expect(rev.filter(p => p.revenue > 0).length).toBeGreaterThan(50);
    const unpaid = unpaidInvoices(snap, NOW);
    expect(unpaid.length).toBeGreaterThan(5);
    expect(unpaid.some(u => u.daysOverdue > 0)).toBe(true);
    const m = businessMetrics(snap, NOW);
    expect(m.inventoryValue).toBeGreaterThan(100_000);
    expect(m.openReceivables).toBeGreaterThan(0);
  });

  it("is served through the connector interface", async () => {
    const c = new DemoConnector({ company: "Morton Industries" }, () => NOW);
    expect((await c.testConnection()).success).toBe(true);
    const snap = await c.fetchSnapshot(90);
    expect(snap.system).toBe("demo");
    expect(snap.since.slice(0, 10)).toBe("2026-06-25");
    expect(snap.warnings).toEqual([]);
  });
});
