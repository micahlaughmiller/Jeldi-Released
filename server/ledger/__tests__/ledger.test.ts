import { describe, it, expect } from "vitest";
import { parseCsv, toCsv, parseDate, parseNumber } from "../csv";
import { snapshotFromLedger } from "../../connectors/native";
import { computeKpis } from "../../services/kpiEngine";

describe("csv helpers", () => {
  it("parses quoted fields, escaped quotes, CRLF and a BOM; normalises headers", () => {
    const rows = parseCsv('﻿Order Number,Customer,"Unit Price"\r\nSO-1,"Acme, Inc.",12.50\r\nSO-2,"He said ""hi""",\n');
    expect(rows).toEqual([
      { order_number: "SO-1", customer: "Acme, Inc.", unit_price: "12.50" },
      { order_number: "SO-2", customer: 'He said "hi"', unit_price: "" },
    ]);
  });
  it("round-trips through toCsv", () => {
    const text = toCsv([{ a: "x,y", b: 'q"r' }], ["a", "b"]);
    expect(parseCsv(text)).toEqual([{ a: "x,y", b: 'q"r' }]);
  });
  it("accepts common date and number formats", () => {
    expect(parseDate("2026-09-30")).toBe("2026-09-30");
    expect(parseDate("9/5/2026")).toBe("2026-09-05");
    expect(parseDate("9/5/26")).toBe("2026-09-05");
    expect(parseDate("")).toBeNull();
    expect(parseNumber("$1,234.50")).toBe(1234.5);
    expect(parseNumber("abc", 7)).toBe(7);
  });
});

describe("native connector", () => {
  const NOW = new Date("2026-09-30T12:00:00Z");
  const data = {
    customers: [{ id: "c1", name: "Acme" }],
    items: [{ id: "i1", sku: "BRK", unitCost: "10.0000", unitPrice: "25.0000", onHand: "100.000", isActive: true }],
    orders: [
      { id: "o1", number: "SO-1", customerId: "c1", orderDate: "2026-09-01", requestedDate: "2026-09-20", status: "closed" },
      { id: "o2", number: "SO-2", customerId: "c1", orderDate: "2026-09-10", requestedDate: "2026-10-05", status: "open" },
      { id: "o3", number: "SO-3", customerId: "c1", orderDate: "2026-09-12", requestedDate: null, status: "cancelled" },
    ],
    lines: [
      { id: "l1", orderId: "o1", lineNo: 1, itemId: "i1", qty: "10.000", unitPrice: "25.0000", unitCost: "10.0000", dueDate: "2026-09-20", qtyShipped: "10.000" },
      { id: "l2", orderId: "o2", lineNo: 1, itemId: "i1", qty: "4.000", unitPrice: "25.0000", unitCost: "10.0000", dueDate: "2026-10-05", qtyShipped: "0.000" },
    ],
    shipments: [{ id: "s1", orderId: "o1", lineId: "l1", shipDate: "2026-09-18", qty: "10.000" }],
    invoices: [{ id: "v1", number: "INV-1", customerId: "c1", orderId: "o1", invoiceDate: "2026-09-19", dueDate: "2026-10-19", amount: "250.00", isCreditMemo: false }],
    payments: [{ id: "p1", invoiceId: "v1", paymentDate: "2026-09-25", amount: "100.00" }],
    jobs: [{ id: "j1", number: "JOB-1", itemId: "i1", qty: "10.000", startDate: "2026-09-02", dueDate: "2026-09-17", completedDate: "2026-09-16", status: "complete" }],
  } as any;

  it("maps ledger rows to the canonical snapshot", () => {
    const snap = snapshotFromLedger("org", data, NOW);
    expect(snap.system).toBe("jeldi");
    expect(snap.salesOrders.map(o => [o.id, o.status, o.amount])).toEqual([["SO-1", "closed", 250], ["SO-2", "open", 100], ["SO-3", "cancelled", 0]]);
    expect(snap.deliveries).toEqual([{ orderId: "SO-1", line: "1", dueDate: "2026-09-20", shippedDate: "2026-09-18", qtyOrdered: 10, qtyShipped: 10 }]);
    expect(snap.margin).toEqual([{ date: "2026-09-18", revenue: 250, cost: 100, units: 10 }]);
    expect(snap.invoices).toEqual([{ id: "INV-1", date: "2026-09-19", dueDate: "2026-10-19", customer: "Acme", amount: 250, balance: 150, isCreditMemo: false }]);
    expect(snap.jobs[0]).toMatchObject({ id: "JOB-1", status: "complete", completedDate: "2026-09-16" });
    expect(snap.inventory).toEqual([{ item: "BRK", onHand: 100, unitCost: 10 }]);
  });

  it("feeds the KPI engine with sensible numbers", () => {
    const k = computeKpis(snapshotFromLedger("org", data, NOW), NOW);
    expect(k.revenue.raw).toBe(250);
    expect(k.orders.raw).toBe(1);
    expect(k.on_time_delivery.raw).toBe(100);
    expect(k.gross_margin.raw).toBe(60);
    expect(k.cost_per_unit.raw).toBe(10);
    expect(k.cycle_time.raw).toBe(14);
    expect(k.performance.raw).toBe(100);
  });
});
