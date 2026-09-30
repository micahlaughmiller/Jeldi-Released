/**
 * Pulls every connected data source into source_records. Finance sources (QuickBooks) also
 * produce an ErpSnapshot, stored against a companion erp_connections row so the existing
 * KPI engine, charts and drill-downs pick the numbers up unchanged.
 */
import { storage } from "../storage";
import { sourceStorage } from "./sourceStorage";
import { buildSourceConnector, PROVIDERS, isSourceProvider } from "./index";
import { writeKpiValues } from "../services/syncService";
import type { DataSource } from "@shared/sources-schema";
import type { SourceItem } from "./types";

export interface SourceSyncResult {
  sourceId: string;
  provider: string;
  ok: boolean;
  message: string;
  items: number;
  warnings: string[];
  durationMs: number;
}

const FULL_HISTORY_DAYS = Number(process.env.SOURCE_SYNC_HISTORY_DAYS || 180);
/** Overlap so edits made just before the previous sync are not missed */
const OVERLAP_MS = 6 * 60 * 60 * 1000;

const running = new Set<string>();

export async function syncSource(source: DataSource, opts: { full?: boolean } = {}): Promise<SourceSyncResult> {
  const started = Date.now();
  const base = { sourceId: source.id, provider: source.provider, warnings: [] as string[] };
  if (running.has(source.id)) return { ...base, ok: false, message: "Sync already running", items: 0, durationMs: 0 };
  running.add(source.id);
  const warnings: string[] = [];
  let items = 0;
  try {
    const creds = sourceStorage.credentials(source);
    const connector = buildSourceConnector(source.provider, creds);
    const since = opts.full || !source.lastSync ? new Date(Date.now() - FULL_HISTORY_DAYS * 86_400_000) : new Date(source.lastSync.getTime() - OVERLAP_MS);
    const stats = await connector.sync({
      since,
      emit: async (batch: SourceItem[]) => { items += await sourceStorage.upsertRecords(source, batch); },
      warn: m => warnings.push(m),
      saveCredentials: c => sourceStorage.saveCredentials(source.id, c),
    });
    if (PROVIDERS[source.provider as keyof typeof PROVIDERS]?.finance && connector.toErpSnapshot) {
      try {
        const records = await sourceStorage.recordsForSource(source.id);
        const snapshot = connector.toErpSnapshot(records.map(r => ({ kind: r.kind, externalId: r.externalId, title: r.title, url: r.url, author: r.author, container: r.container, state: r.state, occurredAt: r.occurredAt, text: r.text, data: r.data })), new Date());
        if (snapshot) await storeFinanceSnapshot(source, snapshot, warnings);
      } catch (e) { warnings.push(`KPI snapshot: ${(e as Error).message}`); }
    }
    const allWarnings = [...new Set([...stats.warnings, ...warnings])];
    await sourceStorage.setStatus(source.id, "connected", allWarnings.length ? allWarnings.slice(0, 5).join(" | ") : null, new Date());
    return { ...base, ok: true, message: "Synced", items, warnings: allWarnings, durationMs: Date.now() - started };
  } catch (error) {
    const message = (error as Error).message;
    console.error(`Source sync failed for ${source.provider} (org ${source.organizationId}):`, message);
    await sourceStorage.setStatus(source.id, "error", message).catch(() => undefined);
    return { ...base, ok: false, message, items, warnings, durationMs: Date.now() - started };
  } finally {
    running.delete(source.id);
  }
}

async function storeFinanceSnapshot(source: DataSource, snapshot: import("../connectors/types").ErpSnapshot, warnings: string[]) {
  const system = source.provider; // "quickbooks"
  let connection = await storage.getErpConnection(source.organizationId, system);
  if (!connection) {
    connection = await storage.createErpConnection({
      userId: source.createdBy ?? (await ownerOf(source.organizationId)), organizationId: source.organizationId, erpSystem: system,
      connectionType: "source", authMethod: "oauth", isConnected: true, config: { sourceId: source.id },
      metadata: { displayName: PROVIDERS[system as keyof typeof PROVIDERS]?.displayName ?? system },
    });
  } else if (!connection.isConnected) {
    await storage.updateErpConnection(connection.id, { isConnected: true });
  }
  snapshot.warnings = warnings;
  await storage.saveErpSnapshot({ connectionId: connection.id, userId: connection.userId, organizationId: source.organizationId, erpSystem: system, snapshot, warnings });
  await storage.updateErpConnection(connection.id, { lastSync: new Date() });
  await writeKpiValues(source.organizationId);
}

async function ownerOf(organizationId: string): Promise<string> {
  const members = (await storage.getOrganizationMembers(organizationId)).filter(m => m.status === "active");
  const owner = members.find(m => (m as { isOwner?: boolean }).isOwner) ?? members[0];
  if (!owner) throw new Error("Organization has no members");
  return owner.userId;
}

/** When a finance source is removed, switch off its companion ERP connection so KPIs stop using it */
export async function detachFinanceConnection(source: DataSource): Promise<void> {
  if (!isSourceProvider(source.provider) || !PROVIDERS[source.provider].finance) return;
  const connection = await storage.getErpConnection(source.organizationId, source.provider);
  if (connection) {
    await storage.updateErpConnection(connection.id, { isConnected: false });
    storage.invalidateSnapshotCache(source.organizationId);
    await writeKpiValues(source.organizationId).catch(() => undefined);
  }
}

export async function syncOrganizationSources(organizationId: string, opts: { full?: boolean } = {}): Promise<SourceSyncResult[]> {
  const sources = (await sourceStorage.list(organizationId)).filter(s => s.status !== "disconnected");
  const results: SourceSyncResult[] = [];
  for (const s of sources) {
    const row = await sourceStorage.get(organizationId, s.id);
    if (row) results.push(await syncSource(row, opts));
  }
  return results;
}

export async function syncAllSources(): Promise<SourceSyncResult[]> {
  const sources = await sourceStorage.allActive();
  const results: SourceSyncResult[] = [];
  for (const s of sources) results.push(await syncSource(s));
  const failed = results.filter(r => !r.ok).length;
  if (results.length) console.log(`Source sync run: ${results.length} source(s), ${failed} failed`);
  return results;
}

let handle: NodeJS.Timeout | null = null;
export function startSourceSyncScheduler(): void {
  const minutes = Number(process.env.SOURCE_SYNC_INTERVAL_MINUTES || 30);
  if (!Number.isFinite(minutes) || minutes <= 0 || handle) return;
  const run = () => syncAllSources().catch(err => console.error("Source sync run failed:", err));
  handle = setInterval(run, minutes * 60 * 1000);
  setTimeout(run, 60 * 1000);
  console.log(`Source sync scheduler: every ${minutes} minute(s)`);
}

/** Short plain-text digest of what the sources hold, for the AI assistant's context */
export async function summarizeSourcesForAi(organizationId: string): Promise<string | null> {
  const sources = await sourceStorage.list(organizationId);
  if (sources.length === 0) return null;
  const ov = await sourceStorage.overview(organizationId, 30);
  const lines: string[] = [`Connected tools: ${sources.map(s => `${s.displayName} (${s.records} records${s.lastSync ? `, synced ${s.lastSync.toISOString().slice(0, 10)}` : ""})`).join("; ")}.`];
  const kinds = ov.byKind.map(k => `${k.recent} ${k.kind.replace("_", " ")}s from ${k.provider} in the last 30 days (${k.total} total)`);
  if (kinds.length) lines.push(kinds.join("; ") + ".");
  if (ov.openWork.length) lines.push(`Open work: ${ov.openWork.map(o => `${o.n} ${o.kind.replace("_", " ")}s (${o.provider})`).join(", ")}; ${ov.staleOpen} open for more than 14 days.`);
  if (ov.containers.length) lines.push(`Most active: ${ov.containers.slice(0, 6).map(c => `${c.container ?? "?"} (${c.recent})`).join(", ")}.`);
  if (ov.people.length) lines.push(`Most active people: ${ov.people.slice(0, 6).map(p => `${p.author} (${p.n})`).join(", ")}.`);
  const recent = await sourceStorage.feed(organizationId, { limit: 25 });
  if (recent.length) lines.push("Latest activity:\n" + recent.map(r => `- [${r.provider}/${r.kind}] ${r.occurredAt?.toISOString().slice(0, 10) ?? ""} ${r.title ?? ""}${r.author ? ` (${r.author})` : ""}${r.state ? ` [${r.state}]` : ""}`).join("\n"));
  return lines.join("\n");
}
