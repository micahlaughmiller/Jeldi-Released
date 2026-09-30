/**
 * GitHub: repositories the token can see (optionally limited to owners/repos in config),
 * pull requests, issues and commits. Token = classic PAT with `repo` (or fine-grained with
 * Contents/Issues/Pull requests read) or an OAuth access token.
 */
import { HttpClient, ErpHttpError } from "../connectors/http";
import type { FetchLike } from "../connectors/types";
import { type SourceConnector, type SourceCredentials, type SyncContext, type SourceSyncStats, type SourceItem, excerpt, iso, DAY } from "./types";

export class GitHubConnector implements SourceConnector {
  readonly provider = "github" as const;
  private readonly http: HttpClient;
  private readonly base: string;

  constructor(private readonly creds: SourceCredentials, fetchImpl?: FetchLike) {
    if (!creds.accessToken) throw new Error("GitHub needs an access token");
    this.base = (creds.config.apiBaseUrl || "https://api.github.com").replace(/\/+$/, "");
    this.http = new HttpClient({ fetchImpl, headers: { Authorization: `Bearer ${creds.accessToken}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "jeldi" } });
  }

  async testConnection() {
    try {
      const me = await this.http.getJson<any>(`${this.base}/user`);
      const repos = await this.listRepos(5);
      return { success: true, message: `Connected to GitHub as ${me.login}; ${repos.length >= 5 ? "5+" : repos.length} repositories visible`, details: { login: me.login } };
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

  private async listRepos(max = 500): Promise<any[]> {
    const cfg = this.creds.config;
    if (Array.isArray(cfg.repos) && cfg.repos.length) {
      const repos: any[] = [];
      for (const full of cfg.repos as string[]) {
        try { repos.push(await this.http.getJson<any>(`${this.base}/repos/${full}`)); } catch { /* skipped, warned in sync */ }
      }
      return repos;
    }
    if (Array.isArray(cfg.owners) && cfg.owners.length) {
      const repos: any[] = [];
      for (const owner of cfg.owners as string[]) {
        try { repos.push(...await this.page<any>(`${this.base}/orgs/${owner}/repos?sort=updated`, max)); }
        catch { repos.push(...await this.page<any>(`${this.base}/users/${owner}/repos?sort=updated`, max)); }
      }
      return repos;
    }
    return this.page<any>(`${this.base}/user/repos?sort=updated&affiliation=owner,collaborator,organization_member`, max);
  }

  async sync(ctx: SyncContext): Promise<SourceSyncStats> {
    const warnings: string[] = [];
    let items = 0;
    const since = ctx.since ?? new Date(Date.now() - 400 * DAY);
    const sinceIso = since.toISOString();
    const repos = await this.listRepos();
    await ctx.emit(repos.map(r => ({
      kind: "repo", externalId: String(r.id), title: r.full_name, url: r.html_url, author: r.owner?.login ?? null, container: r.full_name,
      state: r.archived ? "archived" : "active", occurredAt: r.pushed_at ?? r.updated_at, text: excerpt(r.description),
      data: { language: r.language, stars: r.stargazers_count, openIssues: r.open_issues_count, defaultBranch: r.default_branch, private: r.private },
    })));
    items += repos.length;

    for (const r of repos) {
      const full = r.full_name;
      if (r.archived) continue;
      try {
        const prs = (await this.page<any>(`${this.base}/repos/${full}/pulls?state=all&sort=updated&direction=desc`, 300))
          .filter(p => new Date(p.updated_at) >= since);
        await ctx.emit(prs.map(p => ({
          kind: "pull_request", externalId: `${full}#${p.number}`, title: p.title, url: p.html_url, author: p.user?.login ?? null, container: full,
          state: p.merged_at ? "merged" : p.state, occurredAt: p.merged_at ?? p.closed_at ?? p.updated_at ?? p.created_at, text: excerpt(p.body),
          data: { number: p.number, createdAt: p.created_at, mergedAt: p.merged_at, closedAt: p.closed_at, draft: p.draft, base: p.base?.ref, head: p.head?.ref, labels: (p.labels ?? []).map((l: any) => l.name) },
        })));
        items += prs.length;
      } catch (e) { warnings.push(`${full} pull requests: ${describe(e)}`); }
      try {
        const issues = (await this.page<any>(`${this.base}/repos/${full}/issues?state=all&since=${encodeURIComponent(sinceIso)}&sort=updated&direction=desc`, 300))
          .filter(i => !i.pull_request);
        await ctx.emit(issues.map(i => ({
          kind: "issue", externalId: `${full}#${i.number}`, title: i.title, url: i.html_url, author: i.user?.login ?? null, container: full,
          state: i.state, occurredAt: i.closed_at ?? i.updated_at ?? i.created_at, text: excerpt(i.body),
          data: { number: i.number, createdAt: i.created_at, closedAt: i.closed_at, labels: (i.labels ?? []).map((l: any) => l.name), assignees: (i.assignees ?? []).map((a: any) => a.login), comments: i.comments },
        })));
        items += issues.length;
      } catch (e) { warnings.push(`${full} issues: ${describe(e)}`); }
      try {
        const commits = await this.page<any>(`${this.base}/repos/${full}/commits?since=${encodeURIComponent(sinceIso)}`, 500);
        await ctx.emit(commits.map(c => ({
          kind: "commit", externalId: `${full}@${c.sha}`, title: excerpt(c.commit?.message?.split("\n")[0], 200), url: c.html_url,
          author: c.author?.login ?? c.commit?.author?.name ?? null, container: full, state: null, occurredAt: c.commit?.author?.date ?? c.commit?.committer?.date,
          text: excerpt(c.commit?.message), data: { sha: c.sha },
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
    if (error.status === 401) return "GitHub rejected the token (401)";
    if (error.status === 403) return "GitHub refused (403): token scope or rate limit";
    if (error.status === 404) return "not found (404): check the owner/repo names or token access";
    return `HTTP ${error.status}`;
  }
  return (error as Error).message;
}
