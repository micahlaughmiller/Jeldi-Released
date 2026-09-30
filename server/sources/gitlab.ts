/**
 * GitLab (gitlab.com or self-managed): member projects, merge requests, issues and commits.
 * Token = personal access token with `read_api` (or an OAuth access token).
 */
import { HttpClient, ErpHttpError } from "../connectors/http";
import type { FetchLike } from "../connectors/types";
import { type SourceConnector, type SourceCredentials, type SyncContext, type SourceSyncStats, excerpt, DAY } from "./types";

export class GitLabConnector implements SourceConnector {
  readonly provider = "gitlab" as const;
  private readonly http: HttpClient;
  private readonly base: string;

  constructor(private readonly creds: SourceCredentials, fetchImpl?: FetchLike) {
    if (!creds.accessToken) throw new Error("GitLab needs an access token");
    this.base = `${(creds.config.baseUrl || "https://gitlab.com").replace(/\/+$/, "")}/api/v4`;
    const headers: Record<string, string> = creds.config.authType === "oauth" || creds.config.tokenKind === "oauth"
      ? { Authorization: `Bearer ${creds.accessToken}` }
      : { "PRIVATE-TOKEN": creds.accessToken };
    this.http = new HttpClient({ fetchImpl, headers });
  }

  async testConnection() {
    try {
      const me = await this.http.getJson<any>(`${this.base}/user`);
      const projects = await this.page<any>(`${this.base}/projects?membership=true&simple=true&order_by=last_activity_at`, 5);
      return { success: true, message: `Connected to GitLab as ${me.username}; ${projects.length >= 5 ? "5+" : projects.length} projects visible`, details: { username: me.username } };
    } catch (error) {
      return { success: false, message: describe(error) };
    }
  }

  private async page<T>(url: string, max = 1000): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; out.length < max; page++) {
      const sep = url.includes("?") ? "&" : "?";
      const batch = await this.http.getJson<T[]>(`${url}${sep}per_page=100&page=${page}`);
      if (!Array.isArray(batch) || batch.length === 0) break;
      out.push(...batch);
      if (batch.length < 100) break;
    }
    return out.slice(0, max);
  }

  async sync(ctx: SyncContext): Promise<SourceSyncStats> {
    const warnings: string[] = [];
    let items = 0;
    const since = ctx.since ?? new Date(Date.now() - 400 * DAY);
    const sinceIso = since.toISOString();
    const cfg = this.creds.config;
    let projects: any[];
    if (Array.isArray(cfg.projects) && cfg.projects.length) {
      projects = [];
      for (const p of cfg.projects as string[]) {
        try { projects.push(await this.http.getJson<any>(`${this.base}/projects/${encodeURIComponent(p)}`)); } catch (e) { warnings.push(`${p}: ${describe(e)}`); }
      }
    } else if (cfg.group) {
      projects = await this.page<any>(`${this.base}/groups/${encodeURIComponent(cfg.group)}/projects?include_subgroups=true&order_by=last_activity_at`, 500);
    } else {
      projects = await this.page<any>(`${this.base}/projects?membership=true&order_by=last_activity_at`, 500);
    }
    await ctx.emit(projects.map(p => ({
      kind: "repo", externalId: String(p.id), title: p.path_with_namespace, url: p.web_url, author: p.namespace?.path ?? null, container: p.path_with_namespace,
      state: p.archived ? "archived" : "active", occurredAt: p.last_activity_at, text: excerpt(p.description),
      data: { defaultBranch: p.default_branch, stars: p.star_count, openIssues: p.open_issues_count, visibility: p.visibility },
    })));
    items += projects.length;

    for (const p of projects) {
      if (p.archived) continue;
      const full = p.path_with_namespace;
      try {
        const mrs = await this.page<any>(`${this.base}/projects/${p.id}/merge_requests?state=all&updated_after=${encodeURIComponent(sinceIso)}&order_by=updated_at`, 300);
        await ctx.emit(mrs.map(m => ({
          kind: "pull_request", externalId: `${full}!${m.iid}`, title: m.title, url: m.web_url, author: m.author?.username ?? null, container: full,
          state: m.state === "merged" ? "merged" : m.state === "opened" ? "open" : m.state, occurredAt: m.merged_at ?? m.closed_at ?? m.updated_at ?? m.created_at, text: excerpt(m.description),
          data: { iid: m.iid, createdAt: m.created_at, mergedAt: m.merged_at, closedAt: m.closed_at, draft: m.draft, source: m.source_branch, target: m.target_branch, labels: m.labels },
        })));
        items += mrs.length;
      } catch (e) { warnings.push(`${full} merge requests: ${describe(e)}`); }
      try {
        const issues = await this.page<any>(`${this.base}/projects/${p.id}/issues?state=all&updated_after=${encodeURIComponent(sinceIso)}&order_by=updated_at`, 300);
        await ctx.emit(issues.map(i => ({
          kind: "issue", externalId: `${full}#${i.iid}`, title: i.title, url: i.web_url, author: i.author?.username ?? null, container: full,
          state: i.state === "opened" ? "open" : i.state, occurredAt: i.closed_at ?? i.updated_at ?? i.created_at, text: excerpt(i.description),
          data: { iid: i.iid, createdAt: i.created_at, closedAt: i.closed_at, labels: i.labels, assignees: (i.assignees ?? []).map((a: any) => a.username) },
        })));
        items += issues.length;
      } catch (e) { warnings.push(`${full} issues: ${describe(e)}`); }
      try {
        const commits = await this.page<any>(`${this.base}/projects/${p.id}/repository/commits?since=${encodeURIComponent(sinceIso)}`, 500);
        await ctx.emit(commits.map(c => ({
          kind: "commit", externalId: `${full}@${c.id}`, title: excerpt(c.title, 200), url: c.web_url, author: c.author_name ?? null, container: full,
          state: null, occurredAt: c.committed_date ?? c.created_at, text: excerpt(c.message), data: { sha: c.id },
        })));
        items += commits.length;
      } catch (e) { warnings.push(`${full} commits: ${describe(e)}`); }
    }
    for (const w of warnings) ctx.warn(w);
    return { items, warnings };
  }
}

function describe(error: unknown): string {
  if (error instanceof ErpHttpError) {
    if (error.status === 401) return "GitLab rejected the token (401)";
    if (error.status === 403) return "GitLab refused (403): token scope";
    if (error.status === 404) return "not found (404): check the base URL, group or project paths";
    return `HTTP ${error.status}`;
  }
  return (error as Error).message;
}
