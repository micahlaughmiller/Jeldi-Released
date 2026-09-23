import { describe, it, expect, beforeAll } from "vitest";

// emailService reads TOKEN_ENCRYPTION_KEY at construction time
beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY ||= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.DATABASE_URL ||= "pglite://memory";
});

describe("email templates", () => {
  it("renders list sections, {{.}} items and {{#if}} blocks", async () => {
    const { renderMustache, EMAIL_TEMPLATES, clientSecretFor } = await import("../emailService");
    const out = renderMustache(EMAIL_TEMPLATES.weekly_report.body, {
      recipient: "Sarah <CFO>",
      kpis: [{ name: "Revenue", value: "$1.2M", change: "+4.1%" }, { name: "OTD", value: "94%", change: "-1.0%" }],
      insights: ["Margin up", "Two slow payers"],
    });
    expect(out).toContain("Dear Sarah &lt;CFO&gt;,");
    expect(out).toContain("- Revenue: $1.2M (+4.1%)");
    expect(out).toContain("- OTD: 94% (-1.0%)");
    expect(out).toContain("- Margin up");
    expect(out).toContain("- Two slow payers");
    expect(out).not.toContain("{{");

    const status = renderMustache(EMAIL_TEMPLATES.system_status.body, {
      systems: [{ name: "Epicor", status: "active", last_sync: "10:00" }],
      issues: [],
    });
    expect(status).toContain("- Epicor: active (Last sync: 10:00)");
    expect(status).not.toContain("Issues requiring attention");

    const withIssues = renderMustache(EMAIL_TEMPLATES.system_status.body, { systems: [], issues: ["Token expired"] });
    expect(withIssues).toContain("Issues requiring attention");
    expect(withIssues).toContain("- Token expired");

    // Outlook must not fall back to the Google secret
    process.env.GOOGLE_CLIENT_SECRET = "g"; delete process.env.MICROSOFT_CLIENT_SECRET; delete process.env.OUTLOOK_CLIENT_SECRET;
    expect(clientSecretFor("outlook")).toBe("");
    expect(clientSecretFor("gmail")).toBe("g");
  });
});
