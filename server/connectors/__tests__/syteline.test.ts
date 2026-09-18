import { describe, it, expect } from "vitest";
import { SyteLineConnector } from "../syteline";
import { fakeFetch, type Route } from "./fakeFetch";

const NOW = new Date("2026-09-18T12:00:00Z");
const ionCreds = {
  authMode: "ionapi" as const,
  idoBaseUrl: "https://mingle-ionapi.inforcloudsuite.com/ACME_PRD/CSI/IDORequestService/",
  configName: "SL_Prod",
  tokenUrl: "https://mingle-sso.inforcloudsuite.com/ACME_PRD/as/token.oauth2",
  clientId: "ci", clientSecret: "cs", serviceAccountKey: "saak", serviceAccountSecret: "sask",
};
const IDO = "https://mingle-ionapi.inforcloudsuite.com/ACME_PRD/CSI/IDORequestService/ido";

describe("SyteLineConnector (ION API)", () => {
  it("gets an OAuth token with the backend-service grant and sends it plus the Mongoose config", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { match: "token.oauth2", body: { access_token: "tok-1", expires_in: 7200 } },
      { match: `${IDO}/load/SLCos`, body: { Items: [{ CoNum: "CO1" }], MoreRowsExist: false } },
    ]);
    const c = new SyteLineConnector(ionCreds, { fetchImpl, now: () => NOW });
    const result = await c.testConnection();
    expect(result.success).toBe(true);
    const tokenBody = String(calls[0].init?.body);
    expect(tokenBody).toContain("grant_type=password");
    expect(tokenBody).toContain("username=saak");
    expect(tokenBody).toContain("client_id=ci");
    const headers = calls[1].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-1");
    expect(headers["X-Infor-MongooseConfig"]).toBe("SL_Prod");
    expect(calls[1].url).toContain("recordCap=1");
  });

  it("reuses the token until it is about to expire", async () => {
    let clock = NOW.getTime();
    const { fetchImpl, calls } = fakeFetch([
      { match: "token.oauth2", body: { access_token: "tok", expires_in: 120 } },
      { match: "", body: { Items: [] } },
    ]);
    const c = new SyteLineConnector(ionCreds, { fetchImpl, now: () => new Date(clock) });
    await c.testConnection();
    await c.testConnection();
    expect(calls.filter(x => x.url.includes("token.oauth2")).length).toBe(1);
    clock += 100_000; // within 60s of expiry -> refresh
    await c.testConnection();
    expect(calls.filter(x => x.url.includes("token.oauth2")).length).toBe(2);
  });

  it("normalises IDO rows and reconstructs AR balances from applied payments", async () => {
    const routes: Route[] = [
      { match: "token.oauth2", body: { access_token: "tok" } },
      { match: "/load/SLCos?", body: { Items: [
        { CoNum: "CO100 ", OrderDate: "2026-09-02T00:00:00", Stat: "O", CustNum: " C1 ", Price: 1200 },
        { CoNum: "CO099", OrderDate: "2026-08-01T00:00:00", Stat: "C", CustNum: "C2", Price: 300 },
      ] } },
      { match: "/load/SLCoitems?", body: { Items: [
        { CoNum: "CO100 ", CoLine: 1, CoRelease: 0, Item: "ITM-1", QtyOrdered: 10, QtyShipped: 10, Price: 120, Cost: 80, DueDate: "2026-09-12T00:00:00", Stat: "C" },
      ] } },
      { match: "/load/SLCoShipments?", body: { Items: [
        { CoNum: "CO100 ", CoLine: 1, CoRelease: 0, ShipDate: "2026-09-15T00:00:00", QtyShipped: 10 },
      ] } },
      { match: "/load/SLArtrans?", body: { Items: [
        { TransNum: 1, InvNum: "INV1", CustNum: "C1", Type: "I", InvDate: "2026-09-01T00:00:00", DueDate: "2026-10-01T00:00:00", Amount: 1000 },
        { TransNum: 2, InvNum: null, CustNum: "C1", Type: "P", InvDate: "2026-09-10T00:00:00", Amount: -400, ApplyToInvNum: "INV1" },
        { TransNum: 3, InvNum: "CM1", CustNum: "C1", Type: "C", InvDate: "2026-09-11T00:00:00", Amount: -100, ApplyToInvNum: "INV1" },
      ] } },
      { match: "/load/SLJobs?", body: { Items: [
        { Job: "J100", Suffix: 0, Stat: "C", JobDate: "2026-08-01T00:00:00", StartDate: "2026-08-02T00:00:00", EndDate: "2026-08-20T00:00:00", CompleteDate: "2026-08-18T00:00:00", QtyReleased: 50 },
        { Job: "J101", Suffix: 2, Stat: "R", JobDate: "2026-09-01T00:00:00", QtyReleased: 20 },
      ] } },
      { match: "/load/SLItems?", body: { Items: [{ Item: "ITM-1 ", UnitCost: 80, Stat: "A" }] } },
      { match: "/load/SLItemwhses?", body: { Items: [{ Item: "ITM-1", Whse: "MAIN", QtyOnHand: 40 }, { Item: "ITM-2", Whse: "MAIN", QtyOnHand: 3 }] } },
    ];
    const { fetchImpl, calls } = fakeFetch(routes);
    const snap = await new SyteLineConnector(ionCreds, { fetchImpl, now: () => NOW }).fetchSnapshot(365);

    expect(snap.warnings).toEqual([]);
    expect(snap.salesOrders.map(o => [o.id, o.status, o.customer, o.amount])).toEqual([["CO100 ", "open", "C1", 1200], ["CO099", "closed", "C2", 300]]);
    // shipped 3 days late against the line due date; margin computed from line price/cost
    expect(snap.deliveries).toEqual([{ orderId: "CO100 ", line: "1/0", dueDate: "2026-09-12", shippedDate: "2026-09-15", qtyOrdered: 10, qtyShipped: 10 }]);
    expect(snap.margin).toEqual([{ date: "2026-09-15", revenue: 1200, cost: 800, units: 10 }]);
    // invoice 1000 with 400 payment + 100 credit applied -> balance 500; credit memo listed separately
    const inv = snap.invoices.find(i => i.id === "INV1")!;
    expect(inv.balance).toBe(500);
    expect(inv.amount).toBe(1000);
    expect(snap.invoices.find(i => i.isCreditMemo)?.amount).toBe(100);
    expect(snap.jobs.map(j => [j.id, j.status, j.startDate, j.completedDate])).toEqual([["J100", "complete", "2026-08-02", "2026-08-18"], ["J101-2", "open", "2026-09-01", null]]);
    expect(snap.inventory).toEqual([{ item: "ITM-1", onHand: 40, unitCost: 80 }, { item: "ITM-2", onHand: 3, unitCost: null }]);
    // filter uses SQL-style date literal relative to `now`
    const coCall = calls.find(c => c.url.includes("/load/SLCos?"))!;
    expect(coCall.url.replace(/\+/g, " ")).toContain("filter=OrderDate >= '2025-09-18' OR Stat IN ('O','P')");
  });

  it("surfaces IDO-level failures as warnings", async () => {
    const { fetchImpl } = fakeFetch([
      { match: "token.oauth2", body: { access_token: "tok" } },
      { match: "/load/SLJobs?", body: { Success: false, Message: "IDO SLJobs not found" } },
      { match: "", body: { Items: [] } },
    ]);
    const snap = await new SyteLineConnector(ionCreds, { fetchImpl, now: () => NOW }).fetchSnapshot(30);
    expect(snap.warnings).toEqual(["jobs: IDO SLJobs not found"]);
  });
});

describe("SyteLineConnector (on-prem)", () => {
  it("fetches a Mongoose token from the token endpoint and sends it raw", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { match: "/ido/token/SL_Prod/svc/p@ss", body: { Token: "MG-TOKEN", Success: true } },
      { match: "/load/SLCos", body: { Items: [] } },
    ]);
    const c = new SyteLineConnector({ authMode: "onprem", idoBaseUrl: "https://sl.local/IDORequestService", configName: "SL_Prod", username: "svc", password: "p@ss" }, { fetchImpl, now: () => NOW });
    const result = await c.testConnection();
    expect(result.success).toBe(true);
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe("MG-TOKEN");
  });

  it("rejects incomplete credentials up front", () => {
    expect(() => new SyteLineConnector({ authMode: "onprem", idoBaseUrl: "https://x", configName: "c" } as any)).toThrow(/username and password/);
    expect(() => new SyteLineConnector({ ...ionCreds, clientSecret: "" })).toThrow(/clientSecret/);
  });
});
