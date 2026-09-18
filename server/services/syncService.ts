/**
 * ERP sync: pulls a snapshot from every connected ERP that has a connector, stores it, and
 * writes the computed KPI values into kpi_data so the dashboard, charts and analytics have
 * something real to show.
 *
 * Runs from three places: the interval in server/index.ts, the scheduled Lambda in
 * server/sync-lambda.ts, and POST /api/erp/sync for a manual refresh.
 */
import { storage } from "../storage";
import { connectorForConnection, hasConnector, type ErpSnapshot } from "../connectors";
import { computeKpis, mergeSnapshots, type KpiType } from "./kpiEngine";
import type { ErpConnection } from "@shared/schema";

export interface SyncResult {
  userId: string;
  erpSystem: string;
  ok: boolean;
  message: string;
  warnings: string[];
  counts?: { salesOrders: number; deliveries: number; invoices: number; jobs: number; inventory: number };
  durationMs: number;
}

/** How far back to pull transactional history on each sync (days) */
const HISTORY_DAYS = Number(process.env.ERP_SYNC_HISTORY_DAYS || 400);

export async function syncConnection(connection: ErpConnection): Promise<SyncResult> {
  const started = Date.now();
  const base = { userId: connection.userId, erpSystem: connection.erpSystem, warnings: [] as string[] };
  if (!hasConnector(connection.erpSystem)) {
    return { ...base, ok: false, message: `No connector for ${connection.erpSystem}`, durationMs: Date.now() - started };
  }
  try {
    const connector = connectorForConnection(connection);
    const snapshot = await connector.fetchSnapshot(HISTORY_DAYS);
    await storage.saveErpSnapshot({
      connectionId: connection.id,
      userId: connection.userId,
      erpSystem: connection.erpSystem,
      snapshot,
      warnings: snapshot.warnings,
    });
    await storage.updateErpConnection(connection.id, { lastSync: new Date(), isConnected: true });
    await writeKpiValues(connection.userId);
    return {
      ...base,
      ok: true,
      message: "Synced",
      warnings: snapshot.warnings,
      counts: {
        salesOrders: snapshot.salesOrders.length,
        deliveries: snapshot.deliveries.length,
        invoices: snapshot.invoices.length,
        jobs: snapshot.jobs.length,
        inventory: snapshot.inventory.length,
      },
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const message = (error as Error).message;
    console.error(`ERP sync failed for ${connection.erpSystem} (user ${connection.userId}):`, message);
    await storage.updateErpConnection(connection.id, {
      metadata: { ...((connection.metadata as Record<string, unknown>) ?? {}), lastSyncError: message, lastSyncErrorAt: new Date().toISOString() },
    }).catch(() => undefined);
    return { ...base, ok: false, message, durationMs: Date.now() - started };
  }
}

/** Sync every connector-backed connection a user has */
export async function syncUser(userId: string): Promise<SyncResult[]> {
  const connections = (await storage.getErpConnections(userId)).filter(c => c.isConnected && hasConnector(c.erpSystem));
  const results: SyncResult[] = [];
  for (const c of connections) results.push(await syncConnection(c));
  return results;
}

/** Sync every connected connection in the system (scheduler entry point) */
export async function syncAll(): Promise<SyncResult[]> {
  const connections = await storage.getConnectorBackedConnections();
  const results: SyncResult[] = [];
  for (const c of connections) results.push(await syncConnection(c));
  const failed = results.filter(r => !r.ok).length;
  console.log(`ERP sync run: ${results.length} connection(s), ${failed} failed`);
  return results;
}

/** Latest merged snapshot for a user, or null when nothing has been synced yet */
export async function latestSnapshotForUser(userId: string): Promise<ErpSnapshot | null> {
  const rows = await storage.getLatestErpSnapshots(userId);
  if (rows.length === 0) return null;
  return mergeSnapshots(rows.map(r => r.snapshot as ErpSnapshot));
}

/**
 * Recompute the KPI set from the user's latest snapshot and append one kpi_data row per
 * matching KPI configuration. Only universal KPI types are known to the engine; a user's
 * custom KPI types are left untouched.
 */
export async function writeKpiValues(userId: string, now: Date = new Date()): Promise<number> {
  const snapshot = await latestSnapshotForUser(userId);
  if (!snapshot) return 0;
  const kpis = computeKpis(snapshot, now);
  const configs = await storage.getKpiConfigurations(userId);
  let written = 0;
  for (const config of configs) {
    const kpi = kpis[config.type as KpiType];
    if (!kpi || kpi.raw == null) continue;
    await storage.createKpiData({
      kpiId: config.id,
      value: kpi.value,
      change: kpi.change == null ? null : String(kpi.change),
    });
    written++;
  }
  return written;
}

let intervalHandle: NodeJS.Timeout | null = null;
/** Start the in-process scheduler (long-running server only; Lambda uses sync-lambda.ts) */
export function startSyncScheduler(): void {
  const minutes = Number(process.env.ERP_SYNC_INTERVAL_MINUTES || 15);
  if (!Number.isFinite(minutes) || minutes <= 0 || intervalHandle) return;
  const run = () => syncAll().catch(err => console.error("ERP sync run failed:", err));
  intervalHandle = setInterval(run, minutes * 60 * 1000);
  // first run shortly after boot so a fresh deployment shows data without waiting a full interval
  setTimeout(run, 30 * 1000);
  console.log(`ERP sync scheduler: every ${minutes} minute(s)`);
}
