/**
 * Storage for data sources and the unified source_records store. Tokens are encrypted at rest
 * with the same AES-256-GCM service the ERP connections use.
 */
import { db } from "../db";
import { and, desc, eq, gte, ilike, inArray, or, sql, count, lt } from "drizzle-orm";
import { dataSources, sourceRecords, type DataSource, type InsertDataSource, type SourceRecord } from "@shared/sources-schema";
import { encryptionService } from "../services/encryptionService";
import type { SourceCredentials, SourceItem } from "./types";

const enc = (v: string | null | undefined) => (v ? encryptionService.encrypt(v) : null);
const dec = (v: string | null | undefined) => { if (!v) return null; try { return encryptionService.decrypt(v); } catch { return null; } };

export interface SourceSummary {
  id: string; provider: string; displayName: string; authType: string; status: string;
  lastSync: Date | null; lastError: string | null; config: Record<string, any>; createdAt: Date; records: number;
}

export interface FeedFilter {
  provider?: string;
  kind?: string;
  container?: string;
  q?: string;
  since?: Date;
  limit?: number;
  offset?: number;
}

export const sourceStorage = {
  async list(organizationId: string): Promise<SourceSummary[]> {
    const rows = await db.select().from(dataSources).where(eq(dataSources.organizationId, organizationId)).orderBy(dataSources.createdAt);
    const counts = await db.select({ sourceId: sourceRecords.sourceId, n: count() }).from(sourceRecords)
      .where(eq(sourceRecords.organizationId, organizationId)).groupBy(sourceRecords.sourceId);
    const byId = new Map(counts.map(c => [c.sourceId, Number(c.n)]));
    return rows.map(r => ({
      id: r.id, provider: r.provider, displayName: r.displayName, authType: r.authType, status: r.status, lastSync: r.lastSync, lastError: r.lastError,
      config: publicConfig(r.config as Record<string, any>), createdAt: r.createdAt, records: byId.get(r.id) ?? 0,
    }));
  },

  async get(organizationId: string, id: string): Promise<DataSource | undefined> {
    const [row] = await db.select().from(dataSources).where(and(eq(dataSources.id, id), eq(dataSources.organizationId, organizationId)));
    return row;
  },

  async getByProvider(organizationId: string, provider: string): Promise<DataSource | undefined> {
    const [row] = await db.select().from(dataSources).where(and(eq(dataSources.organizationId, organizationId), eq(dataSources.provider, provider)));
    return row;
  },

  async allActive(): Promise<DataSource[]> {
    return db.select().from(dataSources).where(inArray(dataSources.status, ["connected", "error"]));
  },

  /** Create or replace the organization's source for a provider (one per provider per org) */
  async upsert(input: Omit<InsertDataSource, "accessToken" | "refreshToken"> & { accessToken?: string | null; refreshToken?: string | null }): Promise<DataSource> {
    const values = { ...input, accessToken: enc(input.accessToken), refreshToken: enc(input.refreshToken), updatedAt: new Date() };
    const existing = await this.getByProvider(input.organizationId, input.provider);
    if (existing) {
      const [row] = await db.update(dataSources).set({ ...values, status: "connected", lastError: null }).where(eq(dataSources.id, existing.id)).returning();
      return row;
    }
    const [row] = await db.insert(dataSources).values(values).returning();
    return row;
  },

  async saveCredentials(id: string, creds: Partial<SourceCredentials>): Promise<void> {
    const set: Partial<InsertDataSource> = { updatedAt: new Date() };
    if (creds.accessToken !== undefined) set.accessToken = enc(creds.accessToken);
    if (creds.refreshToken !== undefined) set.refreshToken = enc(creds.refreshToken);
    if (creds.tokenExpiry !== undefined) set.tokenExpiry = creds.tokenExpiry;
    if (creds.config !== undefined) set.config = creds.config;
    await db.update(dataSources).set(set).where(eq(dataSources.id, id));
  },

  async setStatus(id: string, status: string, lastError: string | null, lastSync?: Date): Promise<void> {
    await db.update(dataSources).set({ status, lastError, ...(lastSync ? { lastSync } : {}), updatedAt: new Date() }).where(eq(dataSources.id, id));
  },

  async remove(organizationId: string, id: string): Promise<boolean> {
    await db.delete(sourceRecords).where(and(eq(sourceRecords.sourceId, id), eq(sourceRecords.organizationId, organizationId)));
    const rows = await db.delete(dataSources).where(and(eq(dataSources.id, id), eq(dataSources.organizationId, organizationId))).returning({ id: dataSources.id });
    return rows.length > 0;
  },

  credentials(source: DataSource): SourceCredentials {
    return {
      accessToken: dec(source.accessToken),
      refreshToken: dec(source.refreshToken),
      tokenExpiry: source.tokenExpiry ?? null,
      config: { ...((source.config as Record<string, any>) ?? {}), authType: source.authType },
    };
  },

  /** Upsert a batch of normalised items for a source (unique on source + kind + externalId) */
  async upsertRecords(source: DataSource, items: SourceItem[]): Promise<number> {
    if (items.length === 0) return 0;
    const now = new Date();
    const values = dedupe(items).map(i => ({
      organizationId: source.organizationId, sourceId: source.id, provider: source.provider,
      kind: i.kind, externalId: i.externalId, title: i.title ?? null, url: i.url ?? null, author: i.author ?? null,
      container: i.container ?? null, state: i.state ?? null, occurredAt: toDate(i.occurredAt), text: i.text ?? null, data: i.data ?? null, syncedAt: now,
    }));
    for (let i = 0; i < values.length; i += 200) {
      const chunk = values.slice(i, i + 200);
      await db.insert(sourceRecords).values(chunk).onConflictDoUpdate({
        target: [sourceRecords.sourceId, sourceRecords.kind, sourceRecords.externalId],
        set: {
          title: sql`excluded.title`, url: sql`excluded.url`, author: sql`excluded.author`, container: sql`excluded.container`,
          state: sql`excluded.state`, occurredAt: sql`excluded.occurred_at`, text: sql`excluded.text`, data: sql`excluded.data`, syncedAt: sql`excluded.synced_at`,
        },
      });
    }
    return values.length;
  },

  async getRecord(organizationId: string, id: string): Promise<SourceRecord | undefined> {
    const [row] = await db.select().from(sourceRecords).where(and(eq(sourceRecords.id, id), eq(sourceRecords.organizationId, organizationId)));
    return row;
  },

  async recordsForSource(sourceId: string, kinds?: string[]): Promise<SourceRecord[]> {
    return db.select().from(sourceRecords).where(and(eq(sourceRecords.sourceId, sourceId), ...(kinds?.length ? [inArray(sourceRecords.kind, kinds)] : [])));
  },

  async feed(organizationId: string, f: FeedFilter = {}): Promise<SourceRecord[]> {
    const where = [eq(sourceRecords.organizationId, organizationId)];
    if (f.provider) where.push(eq(sourceRecords.provider, f.provider));
    if (f.kind) where.push(inArray(sourceRecords.kind, f.kind.split(",").map(s => s.trim()).filter(Boolean)));
    if (f.container) where.push(eq(sourceRecords.container, f.container));
    if (f.since) where.push(gte(sourceRecords.occurredAt, f.since));
    if (f.q) {
      const like = `%${f.q.replace(/[%_]/g, m => `\\${m}`)}%`;
      where.push(or(ilike(sourceRecords.title, like), ilike(sourceRecords.text, like), ilike(sourceRecords.author, like), ilike(sourceRecords.container, like))!);
    }
    return db.select().from(sourceRecords).where(and(...where))
      .orderBy(sql`${sourceRecords.occurredAt} desc nulls last`, desc(sourceRecords.syncedAt))
      .limit(Math.min(f.limit ?? 50, 500)).offset(f.offset ?? 0);
  },

  /** Counts by provider and kind, plus per-container activity, for the overview cards */
  async overview(organizationId: string, days = 30) {
    const since = new Date(Date.now() - days * 86_400_000);
    const byKind = await db.select({ provider: sourceRecords.provider, kind: sourceRecords.kind, total: count(), recent: sql<number>`sum(case when ${sourceRecords.occurredAt} >= ${since} then 1 else 0 end)` })
      .from(sourceRecords).where(eq(sourceRecords.organizationId, organizationId)).groupBy(sourceRecords.provider, sourceRecords.kind);
    const containers = await db.select({ provider: sourceRecords.provider, container: sourceRecords.container, recent: count(), last: sql<Date>`max(${sourceRecords.occurredAt})` })
      .from(sourceRecords).where(and(eq(sourceRecords.organizationId, organizationId), gte(sourceRecords.occurredAt, since), inArray(sourceRecords.kind, ["pull_request", "issue", "commit", "message", "file", "invoice", "payment"])))
      .groupBy(sourceRecords.provider, sourceRecords.container).orderBy(desc(count())).limit(12);
    const openWork = await db.select({ provider: sourceRecords.provider, kind: sourceRecords.kind, n: count() }).from(sourceRecords)
      .where(and(eq(sourceRecords.organizationId, organizationId), inArray(sourceRecords.kind, ["pull_request", "issue"]), eq(sourceRecords.state, "open")))
      .groupBy(sourceRecords.provider, sourceRecords.kind);
    const stale = await db.select({ n: count() }).from(sourceRecords)
      .where(and(eq(sourceRecords.organizationId, organizationId), inArray(sourceRecords.kind, ["pull_request", "issue"]), eq(sourceRecords.state, "open"), lt(sourceRecords.occurredAt, new Date(Date.now() - 14 * 86_400_000))));
    const people = await db.select({ author: sourceRecords.author, n: count() }).from(sourceRecords)
      .where(and(eq(sourceRecords.organizationId, organizationId), gte(sourceRecords.occurredAt, since), sql`${sourceRecords.author} is not null`))
      .groupBy(sourceRecords.author).orderBy(desc(count())).limit(10);
    return {
      days,
      byKind: byKind.map(r => ({ ...r, total: Number(r.total), recent: Number(r.recent ?? 0) })),
      containers: containers.map(r => ({ ...r, recent: Number(r.recent) })),
      openWork: openWork.map(r => ({ ...r, n: Number(r.n) })),
      staleOpen: Number(stale[0]?.n ?? 0),
      people: people.map(r => ({ author: r.author, n: Number(r.n) })),
    };
  },

  async countByOrg(organizationId: string): Promise<number> {
    const [r] = await db.select({ n: count() }).from(sourceRecords).where(eq(sourceRecords.organizationId, organizationId));
    return Number(r?.n ?? 0);
  },
};

function toDate(v: SourceItem["occurredAt"]): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dedupe(items: SourceItem[]): SourceItem[] {
  const m = new Map<string, SourceItem>();
  for (const i of items) m.set(`${i.kind}\u0000${i.externalId}`, i);
  return [...m.values()];
}

/** Config without anything that looks like a secret */
export function publicConfig(config: Record<string, any> | null | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(config ?? {})) if (!/secret|token|password/i.test(k)) out[k] = v;
  return out;
}
