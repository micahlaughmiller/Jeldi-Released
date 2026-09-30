import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { performLogout } from "@/lib/logout";
import type { User } from "@shared/schema";

interface TokenField { key: string; label: string; placeholder?: string; secret?: boolean; required?: boolean; help?: string }
interface Provider { provider: string; displayName: string; description: string; authModes: string[]; oauthAvailable: boolean; finance?: boolean; tokenFields: TokenField[] }
interface Source { id: string; provider: string; displayName: string; authType: string; status: string; lastSync: string | null; lastError: string | null; config: Record<string, any>; records: number }
interface Overview {
  sources: Source[]; days: number;
  byKind: { provider: string; kind: string; total: number; recent: number }[];
  containers: { provider: string; container: string | null; recent: number; last: string | null }[];
  openWork: { provider: string; kind: string; n: number }[];
  staleOpen: number;
  people: { author: string | null; n: number }[];
}
interface Rec { id: string; provider: string; kind: string; title: string | null; url: string | null; author: string | null; container: string | null; state: string | null; occurredAt: string | null; text: string | null }

const ICON: Record<string, string> = { github: "fab fa-github", gitlab: "fab fa-gitlab", microsoft: "fab fa-microsoft", quickbooks: "fas fa-file-invoice-dollar" };
const KIND_LABEL: Record<string, string> = { repo: "Repositories", pull_request: "Pull requests", issue: "Issues", commit: "Commits", team: "Teams", channel: "Channels", message: "Messages", site: "Sites", file: "Files", customer: "Customers", item: "Items", invoice: "Invoices", payment: "Payments", credit_memo: "Credit memos", sales_receipt: "Sales receipts" };
const label = (k: string) => KIND_LABEL[k] ?? k.replace(/_/g, " ");
const when = (s: string | null) => (s ? new Date(s).toLocaleString() : "never");
const ago = (s: string | null) => {
  if (!s) return "";
  const d = (Date.now() - new Date(s).getTime()) / 86_400_000;
  return d < 1 ? "today" : d < 2 ? "yesterday" : `${Math.floor(d)}d ago`;
};

export default function IntegrationsPage() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [connecting, setConnecting] = useState<Provider | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");
    if (!token || !userData) { setLocation("/login"); return; }
    try { setUser(JSON.parse(userData)); } catch { setLocation("/login"); }
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status === "connected") toast({ title: `${params.get("provider") ?? "Tool"} connected`, description: "First sync is running; records appear in a minute or two." });
    if (status === "error") toast({ title: "Could not connect", description: params.get("message") ?? "", variant: "destructive" });
    if (status) window.history.replaceState({}, "", "/integrations");
  }, [setLocation, toast]);

  const { data: providers = [] } = useQuery<Provider[]>({ queryKey: ["/api/sources/providers"], enabled: !!user });
  const { data: overview, refetch } = useQuery<Overview>({ queryKey: ["/api/sources/overview"], enabled: !!user, refetchInterval: 20_000 });
  const sources = overview?.sources ?? [];
  const invalidate = () => { for (const k of ["/api/sources/overview", "/api/sources/records", "/api/erp/systems", "/api/dashboard/kpi-preferences"]) qc.invalidateQueries({ queryKey: [k] }); };

  const syncAll = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sources/sync", {}),
    onSuccess: async (r: Response) => { const results = await r.json(); const failed = results.filter((x: any) => !x.ok); toast({ title: failed.length ? `${failed.length} source(s) failed` : "All sources synced", description: failed.map((f: any) => `${f.provider}: ${f.message}`).join("; ") || undefined, variant: failed.length ? "destructive" : undefined }); invalidate(); },
    onError: (e: any) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  });
  const syncOne = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/sources/${id}/sync`, {}),
    onSuccess: async (r: Response) => { const x = await r.json(); toast({ title: x.ok ? `Synced ${x.items} record(s)` : "Sync failed", description: x.ok ? x.warnings.slice(0, 3).join("; ") || undefined : x.message, variant: x.ok ? undefined : "destructive" }); invalidate(); },
    onError: (e: any) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/sources/${id}`),
    onSuccess: () => { toast({ title: "Disconnected" }); invalidate(); },
    onError: (e: any) => toast({ title: "Could not disconnect", description: e.message, variant: "destructive" }),
  });
  const startOauth = useMutation({
    mutationFn: (provider: string) => apiRequest("POST", `/api/sources/oauth/${provider}/start`, {}),
    onSuccess: async (r: Response) => { const { authUrl } = await r.json(); window.location.href = authUrl; },
    onError: (e: any) => toast({ title: "Sign-in not available", description: e.message, variant: "destructive" }),
  });

  if (!user) return null;
  const connectedCount = sources.filter(s => s.status !== "disconnected").length;
  const byProvider = new Map(sources.map(s => [s.provider, s]));

  return (
    <div className="flex h-screen overflow-hidden bg-background" data-testid="integrations-page">
      <Sidebar user={user} onLogout={() => performLogout(setLocation, { showToast: true })} onERPClick={() => setLocation("/dashboard")} connectedCount={connectedCount} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header connectedCount={connectedCount} connectionStatus={connectedCount ? "connected" : "disconnected"} />
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Integrations</h1>
              <p className="text-muted-foreground">Connect the tools your company already runs on. Everything lands in one place: activity, search, KPIs and the AI assistant.</p>
            </div>
            {sources.length > 0 && (
              <Button variant="outline" onClick={() => syncAll.mutate()} disabled={syncAll.isPending} data-testid="button-sync-all">
                <i className={`fas fa-sync mr-2 ${syncAll.isPending ? "fa-spin" : ""}`}></i>Sync everything
              </Button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {providers.map(p => {
              const s = byProvider.get(p.provider);
              return (
                <Card key={p.provider} data-testid={`provider-${p.provider}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2"><i className={`${ICON[p.provider] ?? "fas fa-plug"} text-lg`}></i>{p.displayName}</span>
                      {s ? <Badge variant={s.status === "error" ? "destructive" : "default"}>{s.status}</Badge> : <Badge variant="outline">not connected</Badge>}
                    </CardTitle>
                    <CardDescription>{p.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {s ? (
                      <>
                        <div className="text-sm text-muted-foreground">
                          <div>{s.records.toLocaleString()} records</div>
                          <div>Last sync: {when(s.lastSync)}</div>
                          {s.lastError && <div className="text-destructive mt-1 break-words" title={s.lastError}>{s.lastError.slice(0, 160)}</div>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => syncOne.mutate(s.id)} disabled={syncOne.isPending} data-testid={`button-sync-${p.provider}`}><i className="fas fa-sync mr-1"></i>Sync</Button>
                          <Button size="sm" variant="outline" onClick={() => setConnecting(p)}>Reconnect</Button>
                          <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Disconnect ${p.displayName} and delete its ${s.records} records from Jeldi?`)) remove.mutate(s.id); }} data-testid={`button-remove-${p.provider}`}><i className="fas fa-unlink mr-1"></i>Remove</Button>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {p.oauthAvailable && <Button size="sm" onClick={() => startOauth.mutate(p.provider)} data-testid={`button-oauth-${p.provider}`}><i className="fas fa-sign-in-alt mr-1"></i>Connect with {p.displayName.split(" ")[0]}</Button>}
                        <Button size="sm" variant={p.oauthAvailable ? "outline" : "default"} onClick={() => setConnecting(p)} data-testid={`button-connect-${p.provider}`}><i className="fas fa-key mr-1"></i>{p.oauthAvailable ? "Use a token" : "Connect"}</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {overview && sources.length > 0 && <OverviewCards ov={overview} />}
          {sources.length > 0 && <Feed providers={providers} />}
          {sources.length === 0 && (
            <Card><CardContent className="py-10 text-center text-muted-foreground">
              Nothing connected yet. Pick a tool above. If the company keeps its books in QuickBooks, connect that first: revenue, receivables and margin KPIs come straight from it.
            </CardContent></Card>
          )}
        </div>
      </main>

      {connecting && <ConnectDialog provider={connecting} onClose={() => setConnecting(null)} onDone={() => { setConnecting(null); invalidate(); refetch(); }} />}
    </div>
  );
}

function OverviewCards({ ov }: { ov: Overview }) {
  const kinds = useMemo(() => [...ov.byKind].sort((a, b) => b.recent - a.recent), [ov.byKind]);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Last {ov.days} days</CardTitle></CardHeader>
        <CardContent>
          {kinds.length === 0 && <p className="text-sm text-muted-foreground">Waiting for the first sync.</p>}
          <ul className="space-y-1 text-sm">
            {kinds.map(k => (
              <li key={`${k.provider}-${k.kind}`} className="flex justify-between"><span><i className={`${ICON[k.provider]} mr-2 text-muted-foreground`}></i>{label(k.kind)}</span><span className="tabular-nums"><b>{k.recent}</b> <span className="text-muted-foreground">/ {k.total}</span></span></li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Open work</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {ov.openWork.length === 0 && <p className="text-muted-foreground">No open pull requests or issues.</p>}
          {ov.openWork.map(o => <div key={`${o.provider}-${o.kind}`} className="flex justify-between"><span><i className={`${ICON[o.provider]} mr-2 text-muted-foreground`}></i>Open {label(o.kind).toLowerCase()}</span><b>{o.n}</b></div>)}
          {ov.staleOpen > 0 && <div className="flex justify-between text-amber-600"><span>Open more than 14 days</span><b>{ov.staleOpen}</b></div>}
          {ov.people.length > 0 && <div className="pt-2 border-t text-muted-foreground">Most active: {ov.people.slice(0, 5).map(p => `${p.author} (${p.n})`).join(", ")}</div>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Where things are happening</CardTitle></CardHeader>
        <CardContent>
          {ov.containers.length === 0 && <p className="text-sm text-muted-foreground">Nothing recent yet.</p>}
          <ul className="space-y-1 text-sm">
            {ov.containers.map(c => <li key={`${c.provider}-${c.container}`} className="flex justify-between gap-2"><span className="truncate"><i className={`${ICON[c.provider]} mr-2 text-muted-foreground`}></i>{c.container ?? "?"}</span><span className="tabular-nums whitespace-nowrap"><b>{c.recent}</b> <span className="text-muted-foreground">{ago(c.last)}</span></span></li>)}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Feed({ providers }: { providers: Provider[] }) {
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("all");
  const [kind, setKind] = useState("all");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(t); }, [q]);
  const params = new URLSearchParams({ limit: "100" });
  if (debounced) params.set("q", debounced);
  if (provider !== "all") params.set("provider", provider);
  if (kind !== "all") params.set("kind", kind);
  const url = `/api/sources/records?${params.toString()}`;
  const { data: rows = [], isFetching } = useQuery<Rec[]>({ queryKey: [url] });
  return (
    <Card data-testid="source-feed">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base mr-auto">Activity across every tool</CardTitle>
          <Input placeholder="Search titles, people, text…" value={q} onChange={e => setQ(e.target.value)} className="w-64" data-testid="input-feed-search" />
          <Select value={provider} onValueChange={setProvider}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All tools</SelectItem>{providers.map(p => <SelectItem key={p.provider} value={p.provider}>{p.displayName}</SelectItem>)}</SelectContent></Select>
          <Select value={kind} onValueChange={setKind}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{Object.entries(KIND_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 && <p className="text-sm text-muted-foreground">{isFetching ? "Loading…" : "No records match."}</p>}
        <ul className="divide-y">
          {rows.map(r => (
            <li key={r.id} className="py-2 flex gap-3 text-sm">
              <i className={`${ICON[r.provider] ?? "fas fa-circle"} mt-1 w-4 text-muted-foreground`}></i>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="font-medium hover:underline truncate">{r.title || r.kind}</a> : <span className="font-medium truncate">{r.title || r.kind}</span>}
                  <Badge variant="outline" className="text-xs">{label(r.kind)}</Badge>
                  {r.state && <Badge variant={r.state === "open" || r.state === "overdue" ? "secondary" : "outline"} className="text-xs">{r.state}</Badge>}
                </div>
                <div className="text-muted-foreground text-xs truncate">{[r.container, r.author, r.occurredAt ? new Date(r.occurredAt).toLocaleString() : null].filter(Boolean).join(" · ")}</div>
                {r.text && <div className="text-muted-foreground text-xs mt-0.5 line-clamp-2">{r.text}</div>}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ConnectDialog({ provider, onClose, onDone }: { provider: Provider; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const body = { provider: provider.provider, ...form };
  const test = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sources/test", body),
    onSuccess: async (r: Response) => { const x = await r.json(); setTestMsg({ ok: x.success, text: x.message }); },
    onError: (e: any) => setTestMsg({ ok: false, text: e.message }),
  });
  const connect = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sources/connect", body),
    onSuccess: async (r: Response) => { const x = await r.json(); toast({ title: `${provider.displayName} connected`, description: `${x.message}. First sync is running.` }); onDone(); },
    onError: (e: any) => toast({ title: "Could not connect", description: e.message, variant: "destructive" }),
  });
  const ready = provider.tokenFields.filter(f => f.required).every(f => (form[f.key] ?? "").trim());
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle><i className={`${ICON[provider.provider]} mr-2`}></i>Connect {provider.displayName}</DialogTitle>
          <DialogDescription>{provider.description} Credentials are encrypted before they are stored.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {provider.tokenFields.map(f => (
            <div key={f.key}>
              <Label>{f.label}{f.required && " *"}</Label>
              <Input type={f.secret ? "password" : "text"} placeholder={f.placeholder} value={form[f.key] ?? ""} onChange={e => { setForm({ ...form, [f.key]: e.target.value }); setTestMsg(null); }} data-testid={`input-${provider.provider}-${f.key}`} />
              {f.help && <p className="text-xs text-muted-foreground mt-1">{f.help}</p>}
            </div>
          ))}
          {testMsg && <p className={`text-sm ${testMsg.ok ? "text-green-600" : "text-destructive"}`} data-testid="source-test-result">{testMsg.text}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => test.mutate()} disabled={!ready || test.isPending}>Test</Button>
          <Button onClick={() => connect.mutate()} disabled={!ready || connect.isPending} data-testid="button-save-source">Connect</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
