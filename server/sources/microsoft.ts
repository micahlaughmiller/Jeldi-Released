/**
 * Microsoft 365 via Microsoft Graph: Teams (teams, channels, channel messages), SharePoint
 * sites and their document libraries, OneDrive recent files.
 *
 * Auth: OAuth (delegated) through the same Azure app registration used for Microsoft sign-in
 * and Outlook mail. Scopes: Team.ReadBasic.All, Channel.ReadBasic.All, ChannelMessage.Read.All,
 * Sites.Read.All, Files.Read.All, User.Read, offline_access. An admin may need to grant consent
 * once per tenant for ChannelMessage.Read.All.
 *
 * A pasted access token also works for testing (no refresh).
 */
import { HttpClient, ErpHttpError } from "../connectors/http";
import type { FetchLike } from "../connectors/types";
import { type SourceConnector, type SourceCredentials, type SyncContext, type SourceSyncStats, type SourceItem, excerpt, DAY } from "./types";
import { ensureFreshToken, type RefreshSpec } from "./oauthRefresh";

const GRAPH = "https://graph.microsoft.com/v1.0";
export const MICROSOFT_SOURCE_SCOPES = [
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Team.ReadBasic.All",
  "https://graph.microsoft.com/Channel.ReadBasic.All",
  "https://graph.microsoft.com/ChannelMessage.Read.All",
  "https://graph.microsoft.com/Sites.Read.All",
  "https://graph.microsoft.com/Files.Read.All",
  "offline_access",
];

export function microsoftRefreshSpec(): RefreshSpec | null {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    clientId, clientSecret,
    extra: { scope: MICROSOFT_SOURCE_SCOPES.join(" ") },
  };
}

export class MicrosoftConnector implements SourceConnector {
  readonly provider = "microsoft" as const;
  private readonly http: HttpClient;

  constructor(private readonly creds: SourceCredentials, private readonly fetchImpl?: FetchLike) {
    this.http = new HttpClient({ fetchImpl, timeoutMs: 45_000 });
  }

  private async auth(ctx: Pick<SyncContext, "saveCredentials"> | null) {
    const token = await ensureFreshToken(this.creds, microsoftRefreshSpec(), ctx, this.fetchImpl);
    this.http.setHeader("Authorization", `Bearer ${token}`);
  }

  /** Follow @odata.nextLink pages */
  private async page<T>(url: string, max = 2000): Promise<T[]> {
    const out: T[] = [];
    let next: string | undefined = url;
    while (next && out.length < max) {
      const body: any = await this.http.getJson<any>(next);
      out.push(...((body?.value ?? []) as T[]));
      next = body?.["@odata.nextLink"];
    }
    return out.slice(0, max);
  }

  async testConnection() {
    try {
      await this.auth(null);
      const me = await this.http.getJson<any>(`${GRAPH}/me`);
      let teams = 0;
      try { teams = (await this.page<any>(`${GRAPH}/me/joinedTeams`, 50)).length; } catch { /* Teams may be unlicensed */ }
      return { success: true, message: `Connected to Microsoft 365 as ${me.userPrincipalName ?? me.displayName}; ${teams} team(s) visible`, details: { user: me.userPrincipalName, teams } };
    } catch (error) {
      return { success: false, message: describe(error) };
    }
  }

  async sync(ctx: SyncContext): Promise<SourceSyncStats> {
    const warnings: string[] = [];
    let items = 0;
    const since = ctx.since ?? new Date(Date.now() - 180 * DAY);
    await this.auth(ctx);
    const cfg = this.creds.config;

    // ---- Teams
    if (cfg.teams !== false) {
      let teams: any[] = [];
      try { teams = await this.page<any>(`${GRAPH}/me/joinedTeams`, 200); }
      catch (e) { warnings.push(`Teams: ${describe(e)}`); }
      await ctx.emit(teams.map(t => ({ kind: "team", externalId: t.id, title: t.displayName, url: t.webUrl ?? null, container: t.displayName, text: excerpt(t.description), data: { visibility: t.visibility } })));
      items += teams.length;
      for (const t of teams) {
        let channels: any[] = [];
        try { channels = await this.page<any>(`${GRAPH}/teams/${t.id}/channels`, 200); }
        catch (e) { warnings.push(`${t.displayName} channels: ${describe(e)}`); continue; }
        await ctx.emit(channels.map(c => ({ kind: "channel", externalId: c.id, title: `${t.displayName} / ${c.displayName}`, url: c.webUrl ?? null, container: t.displayName, text: excerpt(c.description), data: { teamId: t.id, membershipType: c.membershipType } })));
        items += channels.length;
        if (cfg.messages === false) continue;
        for (const c of channels) {
          try {
            // Delta gives everything since a point in time without a $filter (which channel messages do not support)
            const msgs = await this.page<any>(`${GRAPH}/teams/${t.id}/channels/${c.id}/messages/delta?$filter=lastModifiedDateTime gt ${since.toISOString()}`, 500);
            const batch: SourceItem[] = msgs
              .filter(m => m.messageType === "message" && !m.deletedDateTime)
              .map(m => ({
                kind: "message", externalId: m.id, title: excerpt(m.subject ?? m.body?.content, 120), url: m.webUrl ?? null,
                author: m.from?.user?.displayName ?? m.from?.application?.displayName ?? null, container: `${t.displayName} / ${c.displayName}`,
                state: null, occurredAt: m.lastModifiedDateTime ?? m.createdDateTime, text: excerpt(m.body?.content),
                data: { teamId: t.id, channelId: c.id, importance: m.importance, replies: undefined, mentions: (m.mentions ?? []).length, attachments: (m.attachments ?? []).length },
              }));
            await ctx.emit(batch);
            items += batch.length;
          } catch (e) { warnings.push(`${t.displayName}/${c.displayName} messages: ${describe(e)}`); }
        }
      }
    }

    // ---- SharePoint sites and their document libraries
    if (cfg.sharepoint !== false) {
      let sites: any[] = [];
      try {
        sites = Array.isArray(cfg.sites) && cfg.sites.length
          ? await Promise.all((cfg.sites as string[]).map(s => this.http.getJson<any>(`${GRAPH}/sites/${encodeURIComponent(s)}`)))
          : await this.page<any>(`${GRAPH}/sites?search=*`, 100);
      } catch (e) { warnings.push(`SharePoint sites: ${describe(e)}`); }
      await ctx.emit(sites.map(s => ({ kind: "site", externalId: s.id, title: s.displayName ?? s.name, url: s.webUrl ?? null, container: s.displayName ?? s.name, occurredAt: s.lastModifiedDateTime, text: excerpt(s.description), data: { siteCollection: s.siteCollection?.hostname } })));
      items += sites.length;
      for (const s of sites) {
        try {
          const drives = await this.page<any>(`${GRAPH}/sites/${s.id}/drives`, 50);
          for (const d of drives) {
            const files = await this.recentFiles(d.id, since, 500);
            await ctx.emit(files.map(f => this.fileItem(f, `${s.displayName ?? s.name} / ${d.name}`)));
            items += files.length;
          }
        } catch (e) { warnings.push(`${s.displayName ?? s.name} files: ${describe(e)}`); }
      }
    }

    // ---- OneDrive (the connecting user's)
    if (cfg.onedrive) {
      try {
        const me = await this.http.getJson<any>(`${GRAPH}/me/drive`);
        const files = await this.recentFiles(me.id, since, 500);
        await ctx.emit(files.map(f => this.fileItem(f, "OneDrive")));
        items += files.length;
      } catch (e) { warnings.push(`OneDrive: ${describe(e)}`); }
    }

    for (const w of warnings) ctx.warn(w);
    return { items, warnings };
  }

  /** Files changed since `since` in a drive, via search on the drive root (delta needs a stored token; search is stateless) */
  private async recentFiles(driveId: string, since: Date, max: number): Promise<any[]> {
    const all = await this.page<any>(`${GRAPH}/drives/${driveId}/root/search(q='')?$select=id,name,webUrl,size,lastModifiedDateTime,createdDateTime,lastModifiedBy,file,folder,parentReference&$orderby=lastModifiedDateTime desc`, max);
    return all.filter(f => f.file && new Date(f.lastModifiedDateTime) >= since);
  }

  private fileItem(f: any, container: string): SourceItem {
    return {
      kind: "file", externalId: f.id, title: f.name, url: f.webUrl ?? null, author: f.lastModifiedBy?.user?.displayName ?? null, container,
      state: null, occurredAt: f.lastModifiedDateTime ?? f.createdDateTime, text: null,
      data: { size: f.size, mimeType: f.file?.mimeType, path: f.parentReference?.path, createdAt: f.createdDateTime },
    };
  }
}

function describe(error: unknown): string {
  if (error instanceof ErpHttpError) {
    if (error.status === 401) return "Microsoft rejected the token (401): reconnect";
    if (error.status === 403) return "Microsoft refused (403): missing Graph permission or admin consent";
    if (error.status === 404) return "not found (404)";
    return `HTTP ${error.status}`;
  }
  return (error as Error).message;
}
