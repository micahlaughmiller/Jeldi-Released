/**
 * Turns a record from anywhere in Jeldi (an issue or pull request from the integration hub, a
 * ledger order or invoice, a KPI drill-down row) into a plain-text email draft. The details are
 * written into the message itself; nothing is sent as a link, so the reader does not need a
 * Jeldi login or access to the source tool.
 */

export interface EmailDraft {
  subject: string;
  body: string;
  /** What the email is about, kept with the sent record */
  related: { kind: string; id: string; title: string };
}

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const SKIP_KEYS = new Set(["url", "html_url", "web_url", "webUrl", "link", "links", "id", "sourceId", "organizationId", "externalId", "syncedAt", "data", "raw"]);

const LABELS: Record<string, string> = {
  pull_request: "Pull request", issue: "Issue", commit: "Commit", repo: "Repository", message: "Teams message", channel: "Channel", team: "Team",
  file: "File", site: "SharePoint site", customer: "Customer", item: "Item", invoice: "Invoice", payment: "Payment", credit_memo: "Credit memo",
  sales_receipt: "Sales receipt", order: "Sales order", job: "Job", kpi: "KPI record",
};

export function kindLabel(kind: string): string {
  return LABELS[kind] ?? kind.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
}

/** Remove anything that looks like a link; the point is that the data travels in the email */
export function stripLinks(text: string): string {
  return text.replace(URL_RE, "").replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").trim();
}

function humanKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
}

function fmtValue(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (Array.isArray(v)) {
    const parts = v.map(x => (typeof x === "object" && x ? fmtObject(x as Record<string, unknown>, true) : fmtValue(x))).filter(Boolean);
    return parts.length ? parts.join("; ") : null;
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") return fmtObject(v as Record<string, unknown>, true);
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 16).replace("T", " ");
  return stripLinks(s);
}

function fmtObject(o: Record<string, unknown>, inline = false): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (SKIP_KEYS.has(k) || /url|link|token|secret|password/i.test(k)) continue;
    const s = fmtValue(v);
    if (s) parts.push(`${humanKey(k)}: ${s}`);
  }
  return inline ? parts.join(", ") : parts.join("\n");
}

/** Lines of "Label: value" for the fields that have a value */
export function fieldLines(fields: Array<[string, unknown]>): string {
  return fields.map(([label, v]) => { const s = fmtValue(v); return s ? `${label}: ${s}` : null; }).filter(Boolean).join("\n");
}

export interface SourceRecordLike {
  id: string; provider: string; kind: string; title?: string | null; author?: string | null; container?: string | null;
  state?: string | null; occurredAt?: string | Date | null; text?: string | null; data?: unknown;
}

/** A record pulled from GitHub, GitLab, Microsoft 365, QuickBooks ... */
export function draftFromSourceRecord(r: SourceRecordLike, senderName?: string): EmailDraft {
  const label = kindLabel(r.kind);
  const title = r.title ?? label;
  const head = fieldLines([
    ["Type", label], ["Source", r.provider.charAt(0).toUpperCase() + r.provider.slice(1)], ["Where", r.container],
    ["Status", r.state], ["By", r.author], ["When", r.occurredAt],
  ]);
  const details = r.data && typeof r.data === "object" ? fmtObject(r.data as Record<string, unknown>) : "";
  const body = [
    `Hello,`, ``, `Sharing the following ${label.toLowerCase()} from ${r.container ?? r.provider}:`, ``,
    `${title}`, head, details ? `` : null, details || null,
    r.text ? `` : null, r.text ? `Description:\n${stripLinks(r.text)}` : null,
    ``, senderName ? `Regards,\n${senderName}` : `Regards`,
  ].filter(x => x !== null).join("\n");
  return { subject: `${label}: ${title}`, body: stripLinks(body), related: { kind: r.kind, id: r.id, title } };
}

/** A ledger order / invoice / job / customer row as the ledger page shows it */
export function draftFromLedger(kind: "order" | "invoice" | "job" | "customer", row: Record<string, any>, senderName?: string): EmailDraft {
  let title = "", lines = "";
  switch (kind) {
    case "order":
      title = `Sales order ${row.number}`;
      lines = fieldLines([["Customer", row.customerName], ["Ordered", row.orderDate], ["Requested", row.requestedDate], ["Status", row.status], ["Total", row.total != null ? Number(row.total).toLocaleString("en-US", { style: "currency", currency: "USD" }) : null]]);
      if (Array.isArray(row.lines) && row.lines.length) {
        lines += `\n\nLines:\n` + row.lines.map((l: any) => `  ${l.lineNo}. ${l.sku ?? l.description ?? ""} qty ${Number(l.qty)} @ ${Number(l.unitPrice).toFixed(2)}${l.dueDate ? `, due ${l.dueDate}` : ""}${Number(l.qtyShipped) ? `, shipped ${Number(l.qtyShipped)}` : ""}`).join("\n");
      }
      break;
    case "invoice":
      title = `${row.isCreditMemo ? "Credit memo" : "Invoice"} ${row.number}`;
      lines = fieldLines([["Customer", row.customerName], ["Order", row.orderNumber], ["Invoice date", row.invoiceDate], ["Due", row.dueDate],
        ["Amount", Number(row.amount).toLocaleString("en-US", { style: "currency", currency: "USD" })], ["Paid", row.paid != null ? Number(row.paid).toLocaleString("en-US", { style: "currency", currency: "USD" }) : null],
        ["Open balance", row.balance != null ? Number(row.balance).toLocaleString("en-US", { style: "currency", currency: "USD" }) : null]]);
      break;
    case "job":
      title = `Job ${row.number}`;
      lines = fieldLines([["Item", row.sku ? `${row.sku} ${row.itemName ?? ""}`.trim() : row.itemName], ["Quantity", row.qty], ["Start", row.startDate], ["Due", row.dueDate], ["Completed", row.completedDate], ["Status", row.status]]);
      break;
    case "customer":
      title = `Customer ${row.name}`;
      lines = fieldLines([["Email", row.email], ["Phone", row.phone], ["Payment terms", row.paymentTermsDays != null ? `${row.paymentTermsDays} days` : null], ["Notes", row.notes]]);
      break;
  }
  const body = [`Hello,`, ``, `Details for ${title}:`, ``, lines, ``, senderName ? `Regards,\n${senderName}` : `Regards`].join("\n");
  return { subject: title, body: stripLinks(body), related: { kind, id: String(row.id ?? row.number), title } };
}

/** One row of a KPI drill-down table (columns carry the labels) */
export function draftFromDrilldownRow(kpiName: string, tableTitle: string, columns: Array<{ key: string; label: string; kind?: string }>, row: Record<string, unknown>, senderName?: string): EmailDraft {
  const first = columns[0];
  const ref = first ? `${first.label} ${fmtValue(row[first.key]) ?? ""}`.trim() : tableTitle;
  const lines = fieldLines(columns.map(c => {
    const v = row[c.key];
    const shown = c.kind === "money" && typeof v === "number" ? v.toLocaleString("en-US", { style: "currency", currency: "USD" }) : c.kind === "percent" && typeof v === "number" ? `${v.toFixed(1)}%` : v;
    return [c.label, shown];
  }));
  const body = [`Hello,`, ``, `From the ${kpiName} view (${tableTitle}):`, ``, lines, ``, senderName ? `Regards,\n${senderName}` : `Regards`].join("\n");
  return { subject: `${kpiName}: ${ref}`, body: stripLinks(body), related: { kind: "kpi", id: ref, title: ref } };
}
