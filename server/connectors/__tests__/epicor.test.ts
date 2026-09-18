import { describe, it, expect } from "vitest";
import { EpicorConnector } from "../epicor";
import { fakeFetch, type Route } from "./fakeFetch";

const creds = { instanceUrl: "https://kinetic.example.com/EpicorERP/", company: "EPIC06", apiKey: "key-123", username: "svc", password: "pw" };
const BASE = "https://kinetic.example.com/EpicorERP/api/v2/odata/EPIC06";

describe("EpicorConnector", () => {
  it("sends Basic auth and the x-api-key header, and reads the company on test", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { match: `${BASE}/Erp.BO.CompanySvc/Companies`, body: { value: [{ Company1: "EPIC06", Name: "Epicor Education" }] } },
    ]);
    const c = new EpicorConnector(creds, { fetchImpl });
    const result = await c.testConnection();
    expect(result.success).toBe(true);
    expect(result.message).toContain("Epicor Education");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("key-123");
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("svc:pw").toString("base64")}`);
    expect(calls[0].url).toContain("$top=1");
  });

  it("explains 403 as an api-key / scope problem", async () => {
    const { fetchImpl } = fakeFetch([{ match: "Companies", status: 403, body: "Forbidden" }]);
    const result = await new EpicorConnector(creds, { fetchImpl }).testConnection();
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/403/);
  });

  it("normalises orders, shipments, invoices, jobs and inventory into a snapshot", async () => {
    const routes: Route[] = [
      { match: "SalesOrderSvc/SalesOrders", body: { value: [
        { OrderNum: 1001, OrderDate: "2026-09-01T00:00:00", OpenOrder: true, VoidOrder: false, CustNum: 7, CustomerCustID: "ACME", NeedByDate: "2026-09-20T00:00:00", DocOrderAmt: 5000 },
        { OrderNum: 1002, OrderDate: "2026-08-15T00:00:00", OpenOrder: false, VoidOrder: true, CustNum: 8, CustomerCustID: "GLOBEX", DocOrderAmt: 900 },
      ] } },
      { match: "SalesOrderSvc/OrderRels", body: { value: [
        { OrderNum: 1001, OrderLine: 1, OrderRelNum: 1, NeedByDate: "2026-09-10T00:00:00", OurReqQty: 10, OpenRelease: false },
      ] } },
      { match: "CustShipSvc/CustShips", body: { value: [{ PackNum: 55, ShipDate: "2026-09-09T00:00:00", CustNum: 7 }] } },
      { match: "CustShipSvc/ShipDtls", body: { value: [
        { PackNum: 55, OrderNum: 1001, OrderLine: 1, OrderRelNum: 1, OurInventoryShipQty: 6, OurJobShipQty: 4, ShipDate: "2026-09-09T00:00:00" },
      ] } },
      { match: "ARInvoiceSvc/ARInvoices", body: { value: [
        { InvoiceNum: 9001, InvoiceDate: "2026-09-05T00:00:00", DueDate: "2026-10-05T00:00:00", CustNum: 7, CustomerName: "Acme Corp", DocInvoiceAmt: 5000, DocInvoiceBal: 2000, OpenInvoice: true, CreditMemo: false, Posted: true },
        { InvoiceNum: 9002, InvoiceDate: "2026-09-06T00:00:00", CustomerName: "Acme Corp", DocInvoiceAmt: -250, DocInvoiceBal: 0, OpenInvoice: false, CreditMemo: true, Posted: true },
        { InvoiceNum: 9003, InvoiceDate: "2026-09-07T00:00:00", DocInvoiceAmt: 100, Posted: false },
      ] } },
      { match: "ARInvoiceSvc/InvcDtls", body: { value: [
        { InvoiceNum: 9001, InvoiceLine: 1, DocExtPrice: 5000, SellingShipQty: 10, MtlUnitCost: 200, LbrUnitCost: 50, BurUnitCost: 25, SubUnitCost: 0, MtlBurUnitCost: 0 },
      ] } },
      { match: "JobEntrySvc/JobEntries", body: { value: [
        { JobNum: "J1", StartDate: "2026-08-20T00:00:00", ReqDueDate: "2026-09-01T00:00:00", JobComplete: true, JobClosed: true, JobCompletionDate: "2026-08-30T00:00:00", ProdQty: 100 },
        { JobNum: "J2", StartDate: "2026-09-10T00:00:00", DueDate: "2026-09-30T00:00:00", JobComplete: false, JobClosed: false, ProdQty: 50 },
      ] } },
      { match: "PartSvc/PartCosts", body: { value: [{ PartNum: "P-1", AvgMaterialCost: 3, AvgLaborCost: 1, AvgBurdenCost: 0.5, AvgSubContCost: 0, AvgMtlBurCost: 0 }] } },
      { match: "PartSvc/PartWhses", body: { value: [{ PartNum: "P-1", WarehouseCode: "MAIN", OnHandQty: 200 }, { PartNum: "P-2", WarehouseCode: "MAIN", OnHandQty: 5 }] } },
    ];
    const { fetchImpl } = fakeFetch(routes);
    const snap = await new EpicorConnector(creds, { fetchImpl }).fetchSnapshot(365);

    expect(snap.system).toBe("epicor");
    expect(snap.warnings).toEqual([]);
    expect(snap.salesOrders).toEqual([
      { id: "1001", orderDate: "2026-09-01", customer: "ACME", status: "open", amount: 5000, requestedDate: "2026-09-20" },
      { id: "1002", orderDate: "2026-08-15", customer: "GLOBEX", status: "cancelled", amount: 900, requestedDate: null },
    ]);
    expect(snap.deliveries).toEqual([{ orderId: "1001", line: "1/1", dueDate: "2026-09-10", shippedDate: "2026-09-09", qtyOrdered: 10, qtyShipped: 10 }]);
    // unposted invoice skipped, credit memo kept positive and flagged
    expect(snap.invoices.map(i => [i.id, i.amount, i.balance, i.isCreditMemo])).toEqual([["9001", 5000, 2000, false], ["9002", 250, 0, true]]);
    expect(snap.margin).toEqual([{ date: "2026-09-05", revenue: 5000, cost: 2750, units: 10 }]);
    expect(snap.jobs.map(j => [j.id, j.status, j.completedDate])).toEqual([["J1", "complete", "2026-08-30"], ["J2", "open", null]]);
    expect(snap.inventory).toEqual([{ item: "P-1", onHand: 200, unitCost: 4.5 }, { item: "P-2", onHand: 5, unitCost: null }]);
  });

  it("records a warning instead of failing when one entity is not readable", async () => {
    const { fetchImpl } = fakeFetch([
      { match: "SalesOrderSvc/SalesOrders", body: { value: [] } },
      { match: "PartSvc/PartWhses", status: 403, body: "no" },
      { match: "", body: { value: [] } }, // everything else
    ]);
    const snap = await new EpicorConnector(creds, { fetchImpl }).fetchSnapshot(30);
    expect(snap.warnings.length).toBe(1);
    expect(snap.warnings[0]).toMatch(/^partWhses: .*403/);
  });

  it("pages with $top/$skip until a short page comes back", async () => {
    const rows = (n: number, offset: number) => Array.from({ length: n }, (_, i) => ({ PartNum: `P${offset + i}`, WarehouseCode: "W", OnHandQty: 1 }));
    const { fetchImpl, calls } = fakeFetch([
      { match: "PartWhses?$select=PartNum,WarehouseCode,OnHandQty&$filter=OnHandQty+ne+0&$top=2&$skip=2", body: { value: rows(1, 2) } },
      { match: "PartWhses", body: { value: rows(2, 0) } },
      { match: "", body: { value: [] } },
    ]);
    const snap = await new EpicorConnector(creds, { fetchImpl, pageSize: 2 }).fetchSnapshot(30);
    expect(snap.inventory.map(i => i.item)).toEqual(["P0", "P1", "P2"]);
    expect(calls.filter(c => c.url.includes("PartWhses")).length).toBe(2);
  });
});
