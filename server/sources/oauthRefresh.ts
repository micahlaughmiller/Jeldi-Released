/**
 * OAuth2 refresh-token helper shared by the Microsoft and QuickBooks source connectors.
 * Returns fresh credentials and persists them through the sync context so the next run
 * does not need to refresh again.
 */
import { HttpClient } from "../connectors/http";
import type { FetchLike } from "../connectors/types";
import type { SourceCredentials, SyncContext } from "./types";

export interface RefreshSpec {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  /** Extra form fields (scope for Microsoft) */
  extra?: Record<string, string>;
  /** QuickBooks wants HTTP basic auth instead of client_id/secret in the body */
  basicAuth?: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

/** Refresh when the access token expires within the next 2 minutes (or when expiry is unknown and refresh is possible on demand) */
export function needsRefresh(creds: SourceCredentials, now = new Date()): boolean {
  if (!creds.refreshToken) return false;
  if (!creds.tokenExpiry) return false;
  return creds.tokenExpiry.getTime() - now.getTime() < 120_000;
}

export async function refreshAccessToken(spec: RefreshSpec, refreshToken: string, fetchImpl?: FetchLike): Promise<{ accessToken: string; refreshToken: string; tokenExpiry: Date }> {
  const http = new HttpClient({ fetchImpl });
  const form: Record<string, string> = { grant_type: "refresh_token", refresh_token: refreshToken, ...(spec.extra ?? {}) };
  const headers: Record<string, string> = {};
  if (spec.basicAuth) {
    headers.Authorization = `Basic ${Buffer.from(`${spec.clientId}:${spec.clientSecret}`).toString("base64")}`;
  } else {
    form.client_id = spec.clientId;
    form.client_secret = spec.clientSecret;
  }
  const token = await http.postForm<TokenResponse>(spec.tokenUrl, form, headers);
  if (!token?.access_token) throw new Error("Token refresh returned no access token");
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? refreshToken,
    tokenExpiry: new Date(Date.now() + (token.expires_in ?? 3600) * 1000),
  };
}

/** Ensure `creds.accessToken` is usable, refreshing and persisting when needed */
export async function ensureFreshToken(creds: SourceCredentials, spec: RefreshSpec | null, ctx: Pick<SyncContext, "saveCredentials"> | null, fetchImpl?: FetchLike): Promise<string> {
  if (spec && creds.refreshToken && needsRefresh(creds)) {
    const fresh = await refreshAccessToken(spec, creds.refreshToken, fetchImpl);
    creds.accessToken = fresh.accessToken;
    creds.refreshToken = fresh.refreshToken;
    creds.tokenExpiry = fresh.tokenExpiry;
    if (ctx) await ctx.saveCredentials(fresh);
  }
  if (!creds.accessToken) throw new Error("No access token; reconnect this source");
  return creds.accessToken;
}
