/** Small RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF/LF, BOM. Returns rows keyed by header. */
export function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter(r => r.some(c => c.trim() !== ""));
  if (nonEmpty.length === 0) return [];
  const header = nonEmpty[0].map(h => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""));
  return nonEmpty.slice(1).map(r => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
    return obj;
  });
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map(r => columns.map(c => esc(r[c])).join(","))].join("\r\n") + "\r\n";
}

/** Accepts YYYY-MM-DD, MM/DD/YYYY, M/D/YY and ISO timestamps; returns YYYY-MM-DD or null */
export function parseDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const yr = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
    return `${yr}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function parseNumber(value: string | undefined | null, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  const n = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
