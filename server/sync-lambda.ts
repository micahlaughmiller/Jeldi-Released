/**
 * Scheduled Lambda entry point: runs one ERP sync pass across every connected system.
 * Wired in serverless.yml as the `sync` function on an EventBridge schedule.
 */
import type { ScheduledHandler } from "aws-lambda";
import { enforceEnvironmentValidation } from "./env-validation";
import { syncAll } from "./services/syncService";
import { syncAllSources } from "./sources/sourceSync";

enforceEnvironmentValidation();

export const handler: ScheduledHandler = async () => {
  const results = await syncAll();
  for (const r of results) {
    console.log(JSON.stringify({ erpSystem: r.erpSystem, userId: r.userId, ok: r.ok, message: r.message, counts: r.counts, warnings: r.warnings.length, durationMs: r.durationMs }));
  }
  for (const r of await syncAllSources()) {
    console.log(JSON.stringify({ source: r.provider, sourceId: r.sourceId, ok: r.ok, message: r.message, items: r.items, warnings: r.warnings.length, durationMs: r.durationMs }));
  }
};
