import { describe, it, expect } from "vitest";
import { draftFromSourceRecord, draftFromLedger, draftFromDrilldownRow, stripLinks } from "../email-format";

describe("email drafts carry the data, never links", () => {
  it("writes an issue's fields and description into the body and drops every URL", () => {
    const d = draftFromSourceRecord({
      id: "r1", provider: "github", kind: "issue", title: "Sync fails for customers with apostrophes", author: "sam", container: "acme/api", state: "open",
      occurredAt: "2026-10-01T14:00:00Z", text: "O'Brien Ltd breaks the query, see https://github.com/acme/api/issues/42 and www.example.com/x",
      data: { number: 42, labels: ["bug"], assignees: ["jane"], html_url: "https://github.com/acme/api/issues/42", comments: 3 },
    }, "Micah");
    expect(d.subject).toBe("Issue: Sync fails for customers with apostrophes");
    expect(d.body).toContain("Type: Issue");
    expect(d.body).toContain("Where: acme/api");
    expect(d.body).toContain("Status: open");
    expect(d.body).toContain("By: sam");
    expect(d.body).toContain("Number: 42");
    expect(d.body).toContain("Labels: bug");
    expect(d.body).toContain("O'Brien Ltd breaks the query");
    expect(d.body).not.toMatch(/https?:\/\//);
    expect(d.body).not.toContain("www.example.com");
    expect(d.body).not.toContain("Html url");
    expect(d.body.trim().endsWith("Regards,\nMicah")).toBe(true);
    expect(d.related).toEqual({ kind: "issue", id: "r1", title: "Sync fails for customers with apostrophes" });
  });
  it("formats a ledger invoice and order with money and lines", () => {
    const inv = draftFromLedger("invoice", { id: "i1", number: "INV-2001", customerName: "Acme", orderNumber: "SO-1001", invoiceDate: "2026-09-19", dueDate: "2026-10-19", amount: "960.00", paid: 100, balance: 860, isCreditMemo: false });
    expect(inv.subject).toBe("Invoice INV-2001");
    expect(inv.body).toContain("Amount: $960.00");
    expect(inv.body).toContain("Open balance: $860.00");
    const ord = draftFromLedger("order", { id: "o1", number: "SO-1001", customerName: "Acme", orderDate: "2026-09-01", status: "open", total: 960, lines: [{ lineNo: 1, sku: "BRK-100", qty: "40", unitPrice: "24", qtyShipped: "10", dueDate: "2026-09-20" }] });
    expect(ord.body).toContain("1. BRK-100 qty 40 @ 24.00, due 2026-09-20, shipped 10");
  });
  it("formats a KPI drill-down row using the column labels", () => {
    const d = draftFromDrilldownRow("Revenue", "Invoices in the last 30 days", [{ key: "invoice", label: "Invoice" }, { key: "customer", label: "Customer" }, { key: "amount", label: "Amount", kind: "money" }], { invoice: "1041", customer: "Caterpillar", amount: 12400 });
    expect(d.subject).toBe("Revenue: Invoice 1041");
    expect(d.body).toContain("Amount: $12,400.00");
    expect(d.body).toContain("Customer: Caterpillar");
  });
  it("stripLinks removes bare and www links but keeps the sentence", () => {
    expect(stripLinks("see https://a.b/c?d=1 then www.x.y/z done")).toBe("see then done");
  });
});
