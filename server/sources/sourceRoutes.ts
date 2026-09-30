/**
 * /api/sources/* : connect the tools a company already uses (GitHub, GitLab, Microsoft 365,
 * QuickBooks, ...) and read the unified activity store they fill.
 *
 * Reads need erp_connections.read (every role); connecting/removing needs erp_connections.manage.
 */
import type { Express, RequestHandler, Response } from "express";
import crypto from "crypto";
import { storage } from "../storage";
import { sourceStorage } from "./sourceStorage";
import { PROVIDERS, SOURCE_PROVIDERS, OAUTH_ENDPOINTS, isSourceProvider, oauthConfigured, oauthClient, describeProvider, buildSourceConnector, credentialsFromForm } from "./index";
import { syncSource, syncOrganizationSources, detachFinanceConnection } from "./sourceSync";
import { HttpClient } from "../connectors/http";
import { getSecureCallbackURL, detectEnvironment } from "../env-validation";
import type { AuthenticatedRequest } from "../services/rbac";

type Authed = AuthenticatedRequest & { user: NonNullable<AuthenticatedRequest["user"]>; organizationId: string };
interface Deps {
  authenticateToken: RequestHandler;
  requirePermission: (resource: string, action: string) => RequestHandler;
}

function callbackUrl(): string {
  return process.env.SOURCES_OAUTH_REDIRECT_URI || getSecureCallbackURL("sources", "/api/sources/oauth/callback");
}

export function registerSourceRoutes(app: Express, deps: Deps) {
  const { authenticateToken, requirePermission } = deps;
  const read = [authenticateToken, requirePermission("erp_connections", "read")];
  const manage = [authenticateToken, requirePermission("erp_connections", "manage")];
  const h = (fn: (req: Authed, res: Response) => Promise<unknown>): RequestHandler => async (req, res) => {
    try { await fn(req as Authed, res); }
    catch (error) {
      const msg = (error as Error).message;
      res.status(/not found/i.test(msg) ? 404 : 400).json({ message: msg });
    }
  };

  /** Catalogue of providers and whether one-click OAuth is available for each */
  app.get("/api/sources/providers", ...read, h(async (_req, res) => {
    res.json(SOURCE_PROVIDERS.map(describeProvider));
  }));

  app.get("/api/sources", ...read, h(async (req, res) => {
    res.json(await sourceStorage.list(req.organizationId));
  }));

  app.get("/api/sources/overview", ...read, h(async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    res.json({ sources: await sourceStorage.list(req.organizationId), ...(await sourceStorage.overview(req.organizationId, days)) });
  }));

  /** Unified feed / search across every connected tool */
  app.get("/api/sources/records", ...read, h(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const rows = await sourceStorage.feed(req.organizationId, {
      provider: q.provider || undefined, kind: q.kind || undefined, container: q.container || undefined, q: q.q || undefined,
      since: q.days ? new Date(Date.now() - Number(q.days) * 86_400_000) : undefined,
      limit: q.limit ? Number(q.limit) : 50, offset: q.offset ? Number(q.offset) : 0,
    });
    res.json(rows.map(r => ({ ...r, data: undefined })));
  }));

  app.get("/api/sources/records/:id", ...read, h(async (req, res) => {
    const found = await sourceStorage.getRecord(req.organizationId, req.params.id);
    if (!found) throw new Error("Record not found");
    res.json(found);
  }));

  /** Try credentials without saving */
  app.post("/api/sources/test", ...manage, h(async (req, res) => {
    const { provider, ...form } = req.body ?? {};
    if (!isSourceProvider(provider)) throw new Error("Unknown provider");
    const parsed = credentialsFromForm(provider, form);
    const connector = buildSourceConnector(provider, { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken, tokenExpiry: null, config: { ...parsed.config, authType: "token" } });
    res.json(await connector.testConnection());
  }));

  /** Connect with a pasted token / settings, then run the first sync in the background */
  app.post("/api/sources/connect", ...manage, h(async (req, res) => {
    const { provider, ...form } = req.body ?? {};
    if (!isSourceProvider(provider)) throw new Error("Unknown provider");
    const parsed = credentialsFromForm(provider, form);
    const connector = buildSourceConnector(provider, { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken, tokenExpiry: null, config: { ...parsed.config, authType: "token" } });
    const test = await connector.testConnection();
    if (!test.success) return res.status(400).json({ message: test.message });
    const source = await sourceStorage.upsert({
      organizationId: req.organizationId, provider, displayName: PROVIDERS[provider].displayName, authType: "token",
      accessToken: parsed.accessToken, refreshToken: parsed.refreshToken, config: { ...parsed.config, ...(test.details ?? {}) }, createdBy: req.user.id,
    });
    syncSource(source, { full: true }).catch(() => undefined);
    res.json({ message: test.message, source: (await sourceStorage.list(req.organizationId)).find(s => s.id === source.id) });
  }));

  /** One-click OAuth: returns the provider's consent URL */
  app.post("/api/sources/oauth/:provider/start", ...manage, h(async (req, res) => {
    const provider = req.params.provider;
    if (!isSourceProvider(provider)) throw new Error("Unknown provider");
    if (!oauthConfigured(provider)) {
      return res.status(400).json({ message: `${PROVIDERS[provider].displayName} sign-in is not set up on this server (needs ${PROVIDERS[provider].oauthEnv.join(" and ")}). Use a token instead.` });
    }
    const endpoint = OAUTH_ENDPOINTS[provider];
    const { clientId } = oauthClient(provider);
    const state = crypto.randomBytes(24).toString("hex");
    await storage.createOAuthSession({
      state, provider: `source_${provider}`, isCompleted: false,
      authResult: { userId: req.user.id, organizationId: req.organizationId, provider, extra: req.body?.config ?? {} },
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: callbackUrl(), response_type: "code", scope: endpoint.scopes.join(" "), state, ...(endpoint.extraAuthParams ?? {}) });
    res.json({ authUrl: `${endpoint.authUrl}?${params.toString()}` });
  }));

  app.get("/api/sources/oauth/callback", async (req, res) => {
    const env = detectEnvironment();
    const frontend = (env.domain || process.env.FRONTEND_URL || "").replace(/\/+$/, "");
    const back = (status: string, extra: Record<string, string> = {}) => res.redirect(`${frontend}/integrations?${new URLSearchParams({ status, ...extra }).toString()}`);
    try {
      const { code, state, realmId, error, error_description } = req.query as Record<string, string | undefined>;
      if (error) return back("error", { message: error_description || error });
      if (!code || !state) return back("error", { message: "Missing code or state" });
      const session = await storage.getOAuthSession ? await storage.getOAuthSessionByState(state) : undefined;
      if (!session || session.isCompleted || session.expiresAt < new Date()) return back("error", { message: "Sign-in link expired; try again" });
      const { userId, organizationId, provider, extra } = session.authResult as { userId: string; organizationId: string; provider: string; extra?: Record<string, any> };
      if (!isSourceProvider(provider)) return back("error", { message: "Unknown provider" });
      const endpoint = OAUTH_ENDPOINTS[provider];
      const { clientId, clientSecret } = oauthClient(provider);
      const http = new HttpClient();
      const form: Record<string, string> = { grant_type: "authorization_code", code, redirect_uri: callbackUrl() };
      const headers: Record<string, string> = {};
      if (endpoint.basicAuth) headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
      else { form.client_id = clientId; form.client_secret = clientSecret; }
      if (provider === "microsoft") form.scope = endpoint.scopes.join(" ");
      const token = await http.postForm<any>(endpoint.tokenUrl, form, headers);
      if (!token?.access_token) return back("error", { message: token?.error_description || token?.error || "No access token returned" });
      const config: Record<string, any> = { ...(extra ?? {}) };
      if (provider === "quickbooks") { config.realmId = realmId; config.sandbox = /sandbox/i.test(process.env.QUICKBOOKS_ENVIRONMENT || ""); }
      const source = await sourceStorage.upsert({
        organizationId, provider, displayName: PROVIDERS[provider].displayName, authType: "oauth",
        accessToken: token.access_token, refreshToken: token.refresh_token ?? null,
        tokenExpiry: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null, config, createdBy: userId,
      });
      await storage.updateOAuthSession(session.id, { isCompleted: true });
      syncSource(source, { full: true }).catch(() => undefined);
      return back("connected", { provider });
    } catch (err) {
      console.error("Source OAuth callback error:", err);
      return back("error", { message: (err as Error).message });
    }
  });

  app.post("/api/sources/:id/sync", ...manage, h(async (req, res) => {
    const source = await sourceStorage.get(req.organizationId, req.params.id);
    if (!source) throw new Error("Source not found");
    res.json(await syncSource(source, { full: req.query.full === "1" || req.body?.full === true }));
  }));

  app.post("/api/sources/sync", ...manage, h(async (req, res) => {
    res.json(await syncOrganizationSources(req.organizationId, { full: req.body?.full === true }));
  }));

  app.post("/api/sources/:id/test", ...manage, h(async (req, res) => {
    const source = await sourceStorage.get(req.organizationId, req.params.id);
    if (!source) throw new Error("Source not found");
    const connector = buildSourceConnector(source.provider, sourceStorage.credentials(source));
    res.json(await connector.testConnection());
  }));

  app.delete("/api/sources/:id", ...manage, h(async (req, res) => {
    const source = await sourceStorage.get(req.organizationId, req.params.id);
    if (!source) throw new Error("Source not found");
    await detachFinanceConnection(source);
    await sourceStorage.remove(req.organizationId, source.id);
    res.json({ message: `${source.displayName} disconnected and its records removed` });
  }));
}
