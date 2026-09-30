import { describe, it, expect } from "vitest";
import { fakeFetch } from "../../connectors/__tests__/fakeFetch";
import { GitHubConnector } from "../github";
import { GitLabConnector } from "../gitlab";
import { MicrosoftConnector } from "../microsoft";
import { QuickBooksConnector, quickbooksSnapshot } from "../quickbooks";
import { credentialsFromForm } from "../index";
import { needsRefresh } from "../oauthRefresh";
import { computeKpis } from "../../services/kpiEngine";
import type { SourceItem, SyncContext } from "../types";

function ctx(since: Date | null = null) {
  const items: SourceItem[] = [];
  const warnings: string[] = [];
  const saved: any[] = [];
  const c: SyncContext = { since, emit: async b => { items.push(...b); }, warn: m => warnings.push(m), saveCredentials: async x => { saved.push(x); } };
  return { c, items, warnings, saved };
}
const creds = (accessToken: string, config: Record<string, any> = {}) => ({ accessToken, refreshToken: null, tokenExpiry: null, config });

describe("GitHub source", () => {
  it("pulls repos, PRs, issues (not PR-issues) and commits, and reports auth failures", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { match: "/user/repos", body: [{ id: 1, full_name: "acme/api", html_url: "https://github.com/acme/api", owner: { login: "acme" }, pushed_at: "2026-09-20T00:00:00Z", description: "API", archived: false }] },
      { match: "/repos/acme/api/pulls", body: [{ number: 7, title: "Add billing", html_url: "u", user: { login: "jane" }, state: "closed", merged_at: "2026-09-19T00:00:00Z", updated_at: "2026-09-19T00:00:00Z", created_at: "2026-09-10T00:00:00Z", body: "<p>hi</p>", labels: [{ name: "feature" }] }] },
      { match: "/repos/acme/api/issues", body: [{ number: 8, title: "Bug", html_url: "u", user: { login: "bob" }, state: "open", updated_at: "2026-09-21T00:00:00Z", created_at: "2026-09-21T00:00:00Z", body: "", labels: [] }, { number: 9, title: "PR shadow", pull_request: {}, state: "open", updated_at: "2026-09-21T00:00:00Z" }] },
      { match: "/repos/acme/api/commits", body: [{ sha: "abc", html_url: "u", author: { login: "jane" }, commit: { message: "fix: thing\n\nmore", author: { date: "2026-09-18T00:00:00Z" } } }] },
      { match: "/user", body: { login: "jane" } },
    ]);
    const gh = new GitHubConnector(creds("tok"), fetchImpl);
    expect((await gh.testConnection()).success).toBe(true);
    const { c, items } = ctx(new Date("2026-09-01T00:00:00Z"));
    const stats = await gh.sync(c);
    expect(stats.items).toBe(4);
    expect(items.map(i => i.kind).sort()).toEqual(["commit", "issue", "pull_request", "repo"]);
    const pr = items.find(i => i.kind === "pull_request")!;
    expect(pr.state).toBe("merged");
    expect(pr.text).toBe("hi");
    expect(pr.externalId).toBe("acme/api#7");
    expect(calls.some(x => x.init?.headers && (x.init.headers as any).Authorization === "Bearer tok")).toBe(true);

    const bad = new GitHubConnector(creds("nope"), fakeFetch([{ match: "", status: 401, body: { message: "Bad credentials" } }]).fetchImpl);
    const t = await bad.testConnection();
    expect(t.success).toBe(false);
    expect(t.message).toMatch(/401/);
  });
  it("limits to configured repos", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { match: "/repos/acme/web/pulls", body: [] }, { match: "/repos/acme/web/issues", body: [] }, { match: "/repos/acme/web/commits", body: [] },
      { match: "/repos/acme/web", body: { id: 2, full_name: "acme/web", owner: { login: "acme" }, archived: false } },
    ]);
    const { c, items } = ctx();
    await new GitHubConnector(creds("t", { repos: ["acme/web"] }), fetchImpl).sync(c);
    expect(items).toHaveLength(1);
    expect(calls.some(x => x.url.includes("/user/repos"))).toBe(false);
  });
});

describe("GitLab source", () => {
  it("uses PRIVATE-TOKEN and maps merge requests", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { match: "/projects/5/merge_requests", body: [{ iid: 3, title: "MR", web_url: "u", author: { username: "kim" }, state: "opened", updated_at: "2026-09-20T00:00:00Z", created_at: "2026-09-20T00:00:00Z", description: "d", labels: [] }] },
      { match: "/projects/5/issues", body: [] }, { match: "/projects/5/repository/commits", body: [] },
      { match: "/projects", body: [{ id: 5, path_with_namespace: "acme/api", web_url: "u", namespace: { path: "acme" }, archived: false, last_activity_at: "2026-09-20T00:00:00Z" }] },
    ]);
    const { c, items } = ctx();
    await new GitLabConnector(creds("glpat"), fetchImpl).sync(c);
    expect(items.find(i => i.kind === "pull_request")?.state).toBe("open");
    expect((calls[0].init?.headers as any)["PRIVATE-TOKEN"]).toBe("glpat");
  });
});

describe("Microsoft 365 source", () => {
  it("walks teams, channels, messages and SharePoint files, following nextLink", async () => {
    const { fetchImpl } = fakeFetch([
      { match: "/me/joinedTeams", body: { value: [{ id: "t1", displayName: "Ops", webUrl: "u" }] } },
      { match: "/teams/t1/channels/c1/messages/delta", body: { value: [{ id: "m1", messageType: "message", body: { content: "<div>Ship it</div>" }, from: { user: { displayName: "Ann" } }, createdDateTime: "2026-09-20T10:00:00Z", lastModifiedDateTime: "2026-09-20T10:00:00Z" }, { id: "m2", messageType: "systemEventMessage" }] } },
      { match: "/teams/t1/channels", body: { value: [{ id: "c1", displayName: "General" }] } },
      { match: "/sites/s1/drives", body: { value: [{ id: "d1", name: "Documents" }] } },
      { match: "/drives/d1/root/search", body: { value: [{ id: "f1", name: "Q3 plan.xlsx", webUrl: "u", file: { mimeType: "x" }, lastModifiedDateTime: "2026-09-25T00:00:00Z", lastModifiedBy: { user: { displayName: "Ann" } }, size: 10 }, { id: "fold", name: "Folder", folder: {} }] } },
      { match: "sites?search=*&$skiptoken=2", body: { value: [] } },
      { match: "/sites?search=*", body: { value: [{ id: "s1", displayName: "Ops Site", webUrl: "u" }], "@odata.nextLink": "https://graph.microsoft.com/v1.0/sites?search=*&$skiptoken=2" } },
      { match: "/me", body: { userPrincipalName: "ann@acme.com" } },
    ]);
    const ms = new MicrosoftConnector(creds("graph"), fetchImpl);
    expect((await ms.testConnection()).success).toBe(true);
    const { c, items } = ctx(new Date("2026-09-01T00:00:00Z"));
    await ms.sync(c);
    expect(items.map(i => i.kind)).toEqual(["team", "channel", "message", "site", "file"]);
    expect(items.find(i => i.kind === "message")?.text).toBe("Ship it");
    expect(items.find(i => i.kind === "message")?.container).toBe("Ops / General");
  });
});

describe("QuickBooks source", () => {
  const rows = (entity: string, list: any[]) => ({ QueryResponse: { [entity]: list } });
  it("pulls customers, items and documents and builds an ErpSnapshot the KPI engine understands", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { match: "from Customer", body: rows("Customer", [{ Id: "1", DisplayName: "Acme", Balance: 500, Active: true }]) },
      { match: "from Item", body: rows("Item", [{ Id: "i1", Name: "Widget", Type: "Inventory", UnitPrice: 50, PurchaseCost: 30, QtyOnHand: 12, TrackQtyOnHand: true }]) },
      { match: "from Invoice", body: rows("Invoice", [{ Id: "101", DocNumber: "1001", TxnDate: "2026-09-10", DueDate: "2026-10-10", TotalAmt: 500, Balance: 500, CustomerRef: { name: "Acme" }, Line: [{ DetailType: "SalesItemLineDetail", Amount: 500, SalesItemLineDetail: { ItemRef: { value: "i1", name: "Widget" }, Qty: 10, UnitPrice: 50 } }] }]) },
      { match: "from CreditMemo", body: rows("CreditMemo", [{ Id: "c1", DocNumber: "CM1", TxnDate: "2026-09-12", TotalAmt: 50, CustomerRef: { name: "Acme" } }]) },
      { match: "from Payment", body: rows("Payment", []) },
      { match: "from SalesReceipt", body: rows("SalesReceipt", [{ Id: "s1", DocNumber: "SR1", TxnDate: "2026-09-15", TotalAmt: 200, CustomerRef: { name: "Bolt" }, Line: [] }]) },
      { match: "/companyinfo/", body: { CompanyInfo: { CompanyName: "Acme Books" } } },
    ]);
    const qb = new QuickBooksConnector(creds("at", { realmId: "123", sandbox: true }), fetchImpl);
    const t = await qb.testConnection();
    expect(t.success).toBe(true);
    expect(t.message).toContain("Acme Books");
    expect(calls[0].url).toContain("sandbox-quickbooks.api.intuit.com/v3/company/123");
    const { c, items } = ctx(new Date("2026-08-01T00:00:00Z"));
    await qb.sync(c);
    expect(items.map(i => i.kind).sort()).toEqual(["credit_memo", "customer", "invoice", "item", "sales_receipt"]);
    expect(items.find(i => i.kind === "invoice")?.state).toBe("open");

    const NOW = new Date("2026-09-30T12:00:00Z");
    const snap = quickbooksSnapshot(items, NOW);
    expect(snap.invoices).toHaveLength(3);
    expect(snap.invoices.find(i => i.isCreditMemo)?.amount).toBe(50);
    expect(snap.inventory).toEqual([{ item: "Widget", onHand: 12, unitCost: 30 }]);
    expect(snap.margin[0]).toEqual({ date: "2026-09-10", revenue: 500, cost: 300, units: 10 });
    const kpis = computeKpis(snap, NOW);
    expect(kpis.revenue.raw).toBe(650); // 500 + 200 - 50 credit memo, all within 30 days
    expect(kpis.orders.raw).toBe(1); // the open invoice; the sales receipt is already closed
    expect(kpis.gross_margin.raw).toBe(40); // 500 revenue vs 300 cost on the invoiced line
  });
  it("needs a realm id", () => {
    expect(() => new QuickBooksConnector(creds("at"))).toThrow(/realm/);
  });
});

describe("registry helpers", () => {
  it("parses the token form into credentials and config", () => {
    const parsed = credentialsFromForm("github", { accessToken: " ghp_x ", owners: "acme, jane", apiBaseUrl: "" });
    expect(parsed).toEqual({ accessToken: "ghp_x", refreshToken: null, config: { owners: ["acme", "jane"] } });
    expect(credentialsFromForm("quickbooks", { accessToken: "a", realmId: "1", sandbox: "yes" }).config).toEqual({ realmId: "1", sandbox: true });
    expect(() => credentialsFromForm("gitlab", { baseUrl: "https://gitlab.com" })).toThrow(/Missing: Personal access token/);
  });
  it("refreshes only when the token is about to expire", () => {
    const soon = new Date(Date.now() + 60_000), later = new Date(Date.now() + 3_600_000);
    expect(needsRefresh({ accessToken: "a", refreshToken: "r", tokenExpiry: soon, config: {} })).toBe(true);
    expect(needsRefresh({ accessToken: "a", refreshToken: "r", tokenExpiry: later, config: {} })).toBe(false);
    expect(needsRefresh({ accessToken: "a", refreshToken: null, tokenExpiry: soon, config: {} })).toBe(false);
  });
});
