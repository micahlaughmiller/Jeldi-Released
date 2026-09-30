/**
 * Registry of data-source providers (the tools a company already runs on). Adding a provider
 * = one connector file + one entry here; the routes, storage, sync and UI are generic.
 */
import type { FetchLike } from "../connectors/types";
import type { ProviderDefinition, SourceCredentials, SourceConnector, SourceProvider } from "./types";
import { GitHubConnector } from "./github";
import { GitLabConnector } from "./gitlab";
import { MicrosoftConnector, MICROSOFT_SOURCE_SCOPES } from "./microsoft";
import { QuickBooksConnector, QUICKBOOKS_SCOPES } from "./quickbooks";

export * from "./types";
export { GitHubConnector, GitLabConnector, MicrosoftConnector, QuickBooksConnector };

export const PROVIDERS: Record<SourceProvider, ProviderDefinition> = {
  github: {
    provider: "github",
    displayName: "GitHub",
    description: "Repositories, pull requests, issues and commits.",
    authModes: ["token", "oauth"],
    oauthEnv: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
    tokenFields: [
      { key: "accessToken", label: "Personal access token", secret: true, required: true, help: "Classic token with the repo scope, or a fine-grained token with read access to Contents, Issues and Pull requests." },
      { key: "owners", label: "Organizations or users (optional)", placeholder: "acme-inc, jane", help: "Comma-separated. Leave empty to pull every repository the token can see." },
      { key: "repos", label: "Specific repositories (optional)", placeholder: "acme-inc/api, acme-inc/web", help: "Comma-separated owner/name pairs. Overrides the owners list." },
      { key: "apiBaseUrl", label: "GitHub Enterprise API URL (optional)", placeholder: "https://github.example.com/api/v3" },
    ],
    build: (creds, fetchImpl) => new GitHubConnector(creds, fetchImpl),
  },
  gitlab: {
    provider: "gitlab",
    displayName: "GitLab",
    description: "Projects, merge requests, issues and commits, on gitlab.com or self-managed.",
    authModes: ["token"],
    oauthEnv: [],
    tokenFields: [
      { key: "accessToken", label: "Personal access token", secret: true, required: true, help: "Needs the read_api scope." },
      { key: "baseUrl", label: "GitLab URL", placeholder: "https://gitlab.com", help: "Change for self-managed GitLab." },
      { key: "group", label: "Group path (optional)", placeholder: "acme-inc", help: "Pull every project in this group and its subgroups." },
      { key: "projects", label: "Specific projects (optional)", placeholder: "acme-inc/api, acme-inc/web", help: "Comma-separated full paths. Overrides the group." },
    ],
    build: (creds, fetchImpl) => new GitLabConnector(creds, fetchImpl),
  },
  microsoft: {
    provider: "microsoft",
    displayName: "Microsoft 365 (Teams + SharePoint)",
    description: "Teams, channels and channel messages; SharePoint sites and document libraries; optionally OneDrive.",
    authModes: ["oauth", "token"],
    oauthEnv: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    tokenFields: [
      { key: "accessToken", label: "Graph access token (testing only)", secret: true, required: true, help: "Expires in about an hour. Use Connect with Microsoft for a lasting connection." },
    ],
    build: (creds, fetchImpl) => new MicrosoftConnector(creds, fetchImpl),
  },
  quickbooks: {
    provider: "quickbooks",
    displayName: "QuickBooks Online",
    description: "Customers, items, invoices, payments, credit memos and sales receipts. Feeds the revenue and receivables KPIs.",
    authModes: ["oauth", "token"],
    oauthEnv: ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET"],
    finance: true,
    tokenFields: [
      { key: "accessToken", label: "Access token (testing only)", secret: true, required: true },
      { key: "refreshToken", label: "Refresh token (optional)", secret: true },
      { key: "realmId", label: "Company (realm) id", required: true, placeholder: "9341453881234567" },
      { key: "sandbox", label: "Sandbox company (yes/no)", placeholder: "no" },
      { key: "apiBaseUrl", label: "API base URL (optional)", placeholder: "https://quickbooks.api.intuit.com", help: "Only for a proxy or test server." },
    ],
    build: (creds, fetchImpl) => new QuickBooksConnector(creds, fetchImpl),
  },
};

export const SOURCE_PROVIDERS = Object.keys(PROVIDERS) as SourceProvider[];

export function isSourceProvider(p: string): p is SourceProvider {
  return (SOURCE_PROVIDERS as string[]).includes(p);
}

export function oauthConfigured(provider: SourceProvider): boolean {
  const def = PROVIDERS[provider];
  return def.authModes.includes("oauth") && def.oauthEnv.every(v => Boolean(process.env[v]));
}

export function buildSourceConnector(provider: string, creds: SourceCredentials, fetchImpl?: FetchLike): SourceConnector {
  if (!isSourceProvider(provider)) throw new Error(`Unknown data source provider "${provider}"`);
  return PROVIDERS[provider].build(creds, fetchImpl);
}

/** OAuth endpoints per provider (authorize URL + token exchange) */
export const OAUTH_ENDPOINTS: Record<string, { authUrl: string; tokenUrl: string; scopes: string[]; basicAuth?: boolean; extraAuthParams?: Record<string, string> }> = {
  github: { authUrl: "https://github.com/login/oauth/authorize", tokenUrl: "https://github.com/login/oauth/access_token", scopes: ["repo", "read:org", "read:user"] },
  microsoft: { authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token", scopes: MICROSOFT_SOURCE_SCOPES, extraAuthParams: { response_mode: "query", prompt: "select_account" } },
  quickbooks: { authUrl: "https://appcenter.intuit.com/connect/oauth2", tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", scopes: QUICKBOOKS_SCOPES, basicAuth: true },
};

export function oauthClient(provider: SourceProvider): { clientId: string; clientSecret: string } {
  const [idVar, secretVar] = PROVIDERS[provider].oauthEnv;
  return { clientId: process.env[idVar!] ?? "", clientSecret: process.env[secretVar!] ?? "" };
}

/** Public view of a provider for the UI (no build function) */
export function describeProvider(p: SourceProvider) {
  const { build: _build, ...rest } = PROVIDERS[p];
  return { ...rest, oauthAvailable: oauthConfigured(p) };
}

/** Parse the token form into stored credentials: comma lists become arrays, yes/no become booleans */
export function credentialsFromForm(provider: SourceProvider, form: Record<string, unknown>): { accessToken: string | null; refreshToken: string | null; config: Record<string, any> } {
  const config: Record<string, any> = {};
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  for (const field of PROVIDERS[provider].tokenFields) {
    const raw = form[field.key];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = String(raw).trim();
    if (field.key === "accessToken") { accessToken = value; continue; }
    if (field.key === "refreshToken") { refreshToken = value; continue; }
    if (["owners", "repos", "projects", "sites"].includes(field.key)) config[field.key] = value.split(",").map(s => s.trim()).filter(Boolean);
    else if (field.key === "sandbox") config.sandbox = /^(y|yes|true|1)$/i.test(value);
    else config[field.key] = value;
  }
  const missing = PROVIDERS[provider].tokenFields.filter(f => f.required && !(f.key === "accessToken" ? accessToken : f.key === "refreshToken" ? refreshToken : config[f.key]));
  if (missing.length) throw new Error(`Missing: ${missing.map(m => m.label).join(", ")}`);
  return { accessToken, refreshToken, config };
}
