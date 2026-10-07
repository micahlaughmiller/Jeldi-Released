/**
 * Reading mail inside Jeldi: inbox listing and message bodies for Gmail and Outlook (the two
 * providers whose OAuth scopes include read), the organization's sent log, and the recipient
 * directory (organization members plus customers from the ledger and the integration hub).
 */
import { db } from "../db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { storage } from "../storage";
import { emailService } from "./emailService";
import { emailMessages, type EmailMessageRow, type InsertEmailMessageRow } from "@shared/email-schema";
import { sourceRecords } from "@shared/sources-schema";
import { ledgerStorage } from "../ledger/ledgerStorage";

export interface InboxMessage {
  id: string;
  from: string;
  fromAddress: string;
  to: string[];
  subject: string;
  preview: string;
  receivedAt: string;
  isRead: boolean;
  hasAttachments: boolean;
}

export interface InboxMessageDetail extends InboxMessage {
  body: string;
  isHtml: boolean;
}

export interface DirectoryEntry { name: string; email: string; group: "organization" | "customers"; detail?: string }

/** Current (refreshed if needed) decrypted access token for a connected Gmail / Outlook account */
async function accessTokenFor(userId: string, provider: "gmail" | "outlook"): Promise<string> {
  const configs = await storage.getEmailConfigurations(userId);
  let config = configs.find(c => c.provider === provider && c.isActive && c.accessToken);
  if (!config) throw new Error(`${provider === "gmail" ? "Gmail" : "Outlook"} is not connected`);
  if (config.tokenExpiry && config.tokenExpiry.getTime() < Date.now() + 60_000) {
    if (!config.refreshToken) throw new Error("Access token expired; reconnect the account");
    await emailService.refreshAccessToken(userId, provider, config.id);
    config = (await storage.getEmailConfigurations(userId)).find(c => c.id === config!.id);
    if (!config?.accessToken) throw new Error("Could not refresh the access token; reconnect the account");
  }
  return emailService.decryptToken(config.accessToken!);
}

async function graph<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' } });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Outlook authentication failed; reconnect the account");
    if (res.status === 403) throw new Error("Outlook refused (Mail.Read permission missing); reconnect the account");
    throw new Error(`Outlook: HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function gmail<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Gmail authentication failed; reconnect the account");
    if (res.status === 403) throw new Error("Gmail refused (gmail.readonly scope missing); reconnect the account");
    throw new Error(`Gmail: HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const header = (headers: Array<{ name: string; value: string }>, name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
const parseAddress = (s: string) => { const m = s.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/); return m ? { name: m[1].trim() || m[2], address: m[2].trim() } : { name: s.trim(), address: s.trim() }; };
const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

function gmailBody(payload: any): { body: string; isHtml: boolean } {
  const parts: any[] = [];
  const walk = (p: any) => { if (!p) return; parts.push(p); (p.parts ?? []).forEach(walk); };
  walk(payload);
  const text = parts.find(p => p.mimeType === "text/plain" && p.body?.data);
  if (text) return { body: b64url(text.body.data), isHtml: false };
  const html = parts.find(p => p.mimeType === "text/html" && p.body?.data);
  if (html) return { body: b64url(html.body.data), isHtml: true };
  return { body: "", isHtml: false };
}

export const emailInbox = {
  async list(userId: string, provider: "gmail" | "outlook", limit = 25): Promise<InboxMessage[]> {
    const token = await accessTokenFor(userId, provider);
    if (provider === "outlook") {
      const r = await graph<{ value: any[] }>(token, `/me/mailFolders/inbox/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,subject,from,toRecipients,bodyPreview,receivedDateTime,isRead,hasAttachments`);
      return r.value.map(m => ({
        id: m.id, from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "", fromAddress: m.from?.emailAddress?.address ?? "",
        to: (m.toRecipients ?? []).map((t: any) => t.emailAddress?.address).filter(Boolean), subject: m.subject ?? "(no subject)",
        preview: m.bodyPreview ?? "", receivedAt: m.receivedDateTime, isRead: Boolean(m.isRead), hasAttachments: Boolean(m.hasAttachments),
      }));
    }
    const list = await gmail<{ messages?: Array<{ id: string }> }>(token, `/messages?labelIds=INBOX&maxResults=${limit}`);
    const out: InboxMessage[] = [];
    for (const { id } of list.messages ?? []) {
      const m = await gmail<any>(token, `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`);
      const h = m.payload?.headers ?? [];
      const from = parseAddress(header(h, "From"));
      out.push({
        id: m.id, from: from.name, fromAddress: from.address, to: header(h, "To").split(",").map((s: string) => parseAddress(s).address).filter(Boolean),
        subject: header(h, "Subject") || "(no subject)", preview: m.snippet ?? "", receivedAt: new Date(Number(m.internalDate)).toISOString(),
        isRead: !(m.labelIds ?? []).includes("UNREAD"), hasAttachments: JSON.stringify(m.payload ?? {}).includes('"filename":"') && /"filename":"[^"]+"/.test(JSON.stringify(m.payload)),
      });
    }
    return out;
  },

  async get(userId: string, provider: "gmail" | "outlook", id: string): Promise<InboxMessageDetail> {
    const token = await accessTokenFor(userId, provider);
    if (provider === "outlook") {
      const m = await graph<any>(token, `/me/messages/${encodeURIComponent(id)}?$select=id,subject,from,toRecipients,body,bodyPreview,receivedDateTime,isRead,hasAttachments`);
      return {
        id: m.id, from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "", fromAddress: m.from?.emailAddress?.address ?? "",
        to: (m.toRecipients ?? []).map((t: any) => t.emailAddress?.address).filter(Boolean), subject: m.subject ?? "(no subject)", preview: m.bodyPreview ?? "",
        receivedAt: m.receivedDateTime, isRead: Boolean(m.isRead), hasAttachments: Boolean(m.hasAttachments),
        body: m.body?.content ?? "", isHtml: (m.body?.contentType ?? "text").toLowerCase() === "html",
      };
    }
    const m = await gmail<any>(token, `/messages/${encodeURIComponent(id)}?format=full`);
    const h = m.payload?.headers ?? [];
    const from = parseAddress(header(h, "From"));
    const { body, isHtml } = gmailBody(m.payload);
    return {
      id: m.id, from: from.name, fromAddress: from.address, to: header(h, "To").split(",").map((s: string) => parseAddress(s).address).filter(Boolean),
      subject: header(h, "Subject") || "(no subject)", preview: m.snippet ?? "", receivedAt: new Date(Number(m.internalDate)).toISOString(),
      isRead: !(m.labelIds ?? []).includes("UNREAD"), hasAttachments: false, body, isHtml,
    };
  },

  async logSent(row: InsertEmailMessageRow): Promise<EmailMessageRow> {
    const [saved] = await db.insert(emailMessages).values(row).returning();
    return saved;
  },

  /** The organization's sent log, newest first (admins see everyone's; others their own) */
  async sent(organizationId: string, userId: string | null, limit = 100): Promise<EmailMessageRow[]> {
    const where = [eq(emailMessages.organizationId, organizationId)];
    if (userId) where.push(eq(emailMessages.userId, userId));
    return db.select().from(emailMessages).where(and(...where)).orderBy(desc(emailMessages.sentAt)).limit(limit);
  },

  /** People you can address: organization members, ledger customers, customers pulled from finance tools */
  async directory(organizationId: string): Promise<DirectoryEntry[]> {
    const out: DirectoryEntry[] = [];
    const seen = new Set<string>();
    const add = (e: DirectoryEntry) => { const k = e.email.toLowerCase(); if (!k || seen.has(k)) return; seen.add(k); out.push(e); };
    for (const m of await storage.getOrganizationMembers(organizationId)) {
      if (m.status === "active" && m.user?.email) add({ name: m.user.username || m.user.email, email: m.user.email, group: "organization", detail: m.isOwner ? "owner" : undefined });
    }
    for (const c of await ledgerStorage.listCustomers(organizationId)) if (c.email) add({ name: c.name, email: c.email, group: "customers", detail: "ledger" });
    const rows = await db.select({ title: sourceRecords.title, data: sourceRecords.data, provider: sourceRecords.provider }).from(sourceRecords)
      .where(and(eq(sourceRecords.organizationId, organizationId), inArray(sourceRecords.kind, ["customer"]))).limit(2000);
    for (const r of rows) {
      const email = (r.data as any)?.email;
      if (typeof email === "string" && email.includes("@")) add({ name: r.title ?? email, email, group: "customers", detail: r.provider });
    }
    return out.sort((a, b) => (a.group === b.group ? a.name.localeCompare(b.name) : a.group === "organization" ? -1 : 1));
  },
};

export const _test = { parseAddress, gmailBody, sqlRef: sql };
