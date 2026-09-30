import type { ErpSnapshot, FetchLike } from "../connectors/types";
import type { DataSource } from "@shared/sources-schema";

export type SourceProvider = "github" | "gitlab" | "microsoft" | "quickbooks";

/** One normalised thing pulled from a source (a PR, a Teams message, an invoice, ...) */
export interface SourceItem {
  kind: string;
  externalId: string;
  title?: string | null;
  url?: string | null;
  author?: string | null;
  container?: string | null;
  state?: string | null;
  occurredAt?: string | Date | null;
  text?: string | null;
  data?: unknown;
}

export interface SourceCredentials {
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: Date | null;
  config: Record<string, any>;
}

export interface SyncContext {
  /** Pull changes since this time (null = full history window) */
  since: Date | null;
  /** Upsert a batch of items; called as pages arrive so memory stays flat */
  emit: (items: SourceItem[]) => Promise<void>;
  /** Non-fatal problems, surfaced in the UI */
  warn: (message: string) => void;
  /** Persist refreshed tokens */
  saveCredentials: (creds: Partial<SourceCredentials>) => Promise<void>;
}

export interface SourceSyncStats {
  items: number;
  warnings: string[];
}

export interface SourceConnector {
  readonly provider: SourceProvider;
  testConnection(): Promise<{ success: boolean; message: string; details?: Record<string, unknown> }>;
  sync(ctx: SyncContext): Promise<SourceSyncStats>;
  /**
   * Finance-type sources also feed the KPI engine. Returns the canonical snapshot built from
   * what the source exposes (invoices, payments, customers, items), or null for non-finance sources.
   */
  toErpSnapshot?(items: SourceItem[], now: Date): ErpSnapshot | null;
}

export interface ProviderDefinition {
  provider: SourceProvider;
  displayName: string;
  description: string;
  /** "token" = paste a personal/access token; "oauth" = redirect to the provider */
  authModes: Array<"token" | "oauth">;
  /** Env vars that must be present for the OAuth path */
  oauthEnv: string[];
  finance?: boolean;
  /** What the token form asks for (token mode) */
  tokenFields: Array<{ key: string; label: string; placeholder?: string; secret?: boolean; required?: boolean; help?: string }>;
  build: (creds: SourceCredentials, fetchImpl?: FetchLike) => SourceConnector;
}

export const DAY = 86_400_000;
export function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? null : x.toISOString();
}
export function excerpt(s: unknown, max = 2000): string | null {
  if (s === null || s === undefined) return null;
  const t = String(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}
