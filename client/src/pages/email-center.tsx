import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useEmailCompose } from "@/components/email/email-compose-context";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import type { User, EmailStatusResponse, EmailConnectResponse } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { performLogout } from "@/lib/logout";
import { kindLabel } from "@shared/email-format";

interface InboxMessage { id: string; from: string; fromAddress: string; to: string[]; subject: string; preview: string; receivedAt: string; isRead: boolean; hasAttachments: boolean }
interface InboxDetail extends InboxMessage { body: string; isHtml: boolean }
interface SentRow { id: string; provider: string; fromAddress: string | null; to: string[]; cc: string[]; subject: string; body: string; status: string; error: string | null; relatedKind: string | null; relatedId: string | null; relatedTitle: string | null; sentAt: string }

const when = (s: string) => new Date(s).toLocaleString();
const PROVIDER_LABEL: Record<string, string> = { outlook: "Outlook", gmail: "Gmail", smtp: "SMTP", demo: "Demo outbox" };

export default function EmailCenter() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState("inbox");
  const { open: compose } = useEmailCompose();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: emailStatus, refetch } = useQuery<EmailStatusResponse>({ queryKey: ["/api/email/status"], enabled: !!user });

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");
    if (!token || !userData) { setLocation("/login"); return; }
    try { setUser(JSON.parse(userData)); } catch { localStorage.removeItem("token"); localStorage.removeItem("user"); setLocation("/login"); }
    const params = new URLSearchParams(window.location.search);
    if (params.get("status") === "connected") { toast({ title: `${params.get("provider") ?? "Email"} connected` }); window.history.replaceState({}, "", "/email"); setTab("accounts"); }
    if (params.get("status") === "error") { toast({ title: "Could not connect", description: params.get("message") ?? "", variant: "destructive" }); window.history.replaceState({}, "", "/email"); setTab("accounts"); }
  }, [setLocation, toast]);

  // OAuth popup reports back
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "email_oauth_success") { toast({ title: "Email connected", description: `${event.data.provider} is ready` }); refetch(); }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [toast, refetch]);

  // Land on Accounts until something is connected
  useEffect(() => {
    if (!emailStatus) return;
    const any = (["outlook", "gmail", "smtp", "demo"] as const).some(p => emailStatus[p]?.isConnected);
    if (!any) setTab("accounts");
  }, [emailStatus]);

  if (!user) return null;
  const connected = (["outlook", "gmail", "smtp", "demo"] as const).filter(p => emailStatus?.[p]?.isConnected);

  return (
    <div className="flex h-screen overflow-hidden bg-background" data-testid="email-center-container">
      <Sidebar user={user} onLogout={() => performLogout(setLocation, { showToast: true })} onERPClick={() => setLocation("/dashboard")} connectedCount={0} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header connectedCount={0} connectionStatus={connected.length ? "connected" : "disconnected"} />
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold" data-testid="heading-email-center">Email</h1>
              <p className="text-muted-foreground">Read and send mail from your connected account without leaving Jeldi. Right-click any issue, order, invoice or KPI row anywhere in the app to email its details.</p>
            </div>
            <Button onClick={() => compose()} data-testid="button-compose-email"><i className="fas fa-pen mr-2"></i>New email</Button>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="inbox" data-testid="tab-inbox">Inbox</TabsTrigger>
              <TabsTrigger value="sent" data-testid="tab-sent">Sent from Jeldi</TabsTrigger>
              <TabsTrigger value="accounts" data-testid="tab-accounts">Accounts{connected.length ? ` (${connected.length})` : ""}</TabsTrigger>
            </TabsList>
            <TabsContent value="inbox"><InboxTab status={emailStatus} onReply={(m) => compose({ to: [m.fromAddress], subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`, body: `\n\n----- On ${when(m.receivedAt)}, ${m.from} wrote:\n${m.body.replace(/<[^>]+>/g, " ").replace(/\s+\n/g, "\n").trim()}` })} /></TabsContent>
            <TabsContent value="sent"><SentTab /></TabsContent>
            <TabsContent value="accounts"><AccountsTab status={emailStatus} refetch={refetch} queryClient={queryClient} /></TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

function InboxTab({ status, onReply }: { status?: EmailStatusResponse; onReply: (m: InboxDetail) => void }) {
  const readable = (["outlook", "gmail"] as const).filter(p => status?.[p]?.isConnected);
  const [provider, setProvider] = useState<string>("");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { if (!provider && readable.length) setProvider(readable[0]); }, [readable, provider]);
  const { data, isFetching, error, refetch } = useQuery<{ provider: string; messages: InboxMessage[] }>({ queryKey: [`/api/email/inbox?provider=${provider}`], enabled: !!provider, refetchInterval: 60_000, retry: false });
  const { data: detail, isFetching: loadingDetail } = useQuery<InboxDetail>({ queryKey: [`/api/email/inbox/${provider}/${encodeURIComponent(selected ?? "")}`], enabled: !!provider && !!selected, retry: false });

  if (readable.length === 0) {
    return (
      <Card><CardContent className="py-10 text-center text-muted-foreground">
        {status?.smtp?.isConnected || status?.demo?.isConnected
          ? "Your SMTP / demo account can send but not read mail. Connect Outlook or Gmail under Accounts to see an inbox here."
          : "Connect Outlook or Gmail under Accounts to read your inbox here."}
      </CardContent></Card>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card data-testid="inbox-list">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base mr-auto">Inbox</CardTitle>
            {readable.length > 1 && (
              <Select value={provider} onValueChange={v => { setProvider(v); setSelected(null); }}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{readable.map(p => <SelectItem key={p} value={p}>{PROVIDER_LABEL[p]}</SelectItem>)}</SelectContent></Select>
            )}
            <Button size="sm" variant="ghost" onClick={() => refetch()} title="Refresh"><i className={`fas fa-sync ${isFetching ? "fa-spin" : ""}`}></i></Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error && <p className="p-4 text-sm text-destructive">{(error as Error).message}</p>}
          {!error && data && data.messages.length === 0 && <p className="p-4 text-sm text-muted-foreground">Inbox is empty.</p>}
          <ul className="divide-y max-h-[65vh] overflow-auto">
            {(data?.messages ?? []).map(m => (
              <li key={m.id}>
                <button type="button" className={`w-full text-left px-4 py-2.5 hover:bg-accent ${selected === m.id ? "bg-accent" : ""}`} onClick={() => setSelected(m.id)} data-testid={`inbox-${m.id}`}>
                  <div className="flex justify-between gap-2 text-sm"><span className={`truncate ${m.isRead ? "" : "font-semibold"}`}>{m.from}</span><span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(m.receivedAt).toLocaleDateString()}</span></div>
                  <div className={`text-sm truncate ${m.isRead ? "" : "font-medium"}`}>{m.subject}{m.hasAttachments && <i className="fas fa-paperclip ml-1 text-xs text-muted-foreground"></i>}</div>
                  <div className="text-xs text-muted-foreground truncate">{m.preview}</div>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card data-testid="inbox-detail">
        {!selected && <CardContent className="py-10 text-center text-muted-foreground">Pick a message to read it.</CardContent>}
        {selected && (loadingDetail || !detail) && <CardContent className="py-10 text-center text-muted-foreground"><i className="fas fa-spinner fa-spin mr-2"></i>Loading…</CardContent>}
        {selected && detail && (
          <>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{detail.subject}</CardTitle>
              <div className="text-xs text-muted-foreground">From {detail.from} &lt;{detail.fromAddress}&gt; · {when(detail.receivedAt)}</div>
              <div className="text-xs text-muted-foreground">To {detail.to.join(", ")}</div>
              <div className="pt-2"><Button size="sm" variant="outline" onClick={() => onReply(detail)} data-testid="button-reply"><i className="fas fa-reply mr-1"></i>Reply</Button></div>
            </CardHeader>
            <CardContent>
              {detail.isHtml
                ? <iframe title="message" sandbox="" className="w-full min-h-[50vh] bg-white rounded border" srcDoc={detail.body} />
                : <pre className="whitespace-pre-wrap text-sm font-sans">{detail.body}</pre>}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}

function SentTab() {
  const { data: rows = [], isFetching } = useQuery<SentRow[]>({ queryKey: ["/api/email/sent"], refetchInterval: 30_000 });
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Card data-testid="sent-list">
      <CardHeader className="pb-2"><CardTitle className="text-base">Sent from Jeldi</CardTitle></CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">{isFetching ? "Loading…" : "Nothing sent yet. Right-click a record anywhere in Jeldi, or use New email."}</p>}
        <ul className="divide-y">
          {rows.map(r => (
            <li key={r.id}>
              <button type="button" className="w-full text-left px-4 py-2.5 hover:bg-accent" onClick={() => setOpenId(openId === r.id ? null : r.id)} data-testid={`sent-${r.id}`}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium truncate">{r.subject}</span>
                  {r.relatedKind && <Badge variant="outline" className="text-xs">{kindLabel(r.relatedKind)}{r.relatedTitle ? `: ${r.relatedTitle}` : ""}</Badge>}
                  {r.status === "failed" && <Badge variant="destructive" className="text-xs">failed</Badge>}
                  <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{when(r.sentAt)} · {PROVIDER_LABEL[r.provider] ?? r.provider}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">To {r.to.join(", ")}{r.cc.length ? ` · Cc ${r.cc.join(", ")}` : ""}{r.fromAddress ? ` · from ${r.fromAddress}` : ""}</div>
                {r.error && <div className="text-xs text-destructive truncate">{r.error}</div>}
              </button>
              {openId === r.id && <pre className="whitespace-pre-wrap text-sm font-sans px-4 pb-4 text-muted-foreground" data-testid="sent-body">{r.body}</pre>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function AccountsTab({ status, refetch, queryClient }: { status?: EmailStatusResponse; refetch: () => void; queryClient: ReturnType<typeof useQueryClient> }) {
  const { toast } = useToast();
  const [smtp, setSmtp] = useState({ host: "", port: "587", secure: false, username: "", password: "", fromAddress: "" });

  const connectProvider = useMutation<EmailConnectResponse, Error, "gmail" | "outlook">({
    mutationFn: async (provider) => (await apiRequest("POST", `/api/email/connect/${provider}`, {})).json(),
    onSuccess: (data, provider) => {
      if (data.authUrl) { window.open(data.authUrl, "_blank"); toast({ title: "Sign in to continue", description: `Finish the ${provider} sign-in in the new window` }); }
      else if (data.isConnected) { toast({ title: "Already connected" }); refetch(); }
    },
    onError: (error) => toast({ title: "Connection failed", description: error.message, variant: "destructive" }),
  });
  const connectSmtp = useMutation<EmailConnectResponse, Error>({
    mutationFn: async () => (await apiRequest("POST", "/api/email/connect/smtp", { ...smtp, port: Number(smtp.port) })).json(),
    onSuccess: (data) => { toast({ title: "SMTP connected", description: data.message }); setSmtp(s => ({ ...s, password: "" })); refetch(); },
    onError: (error) => toast({ title: "SMTP connection failed", description: error.message, variant: "destructive" }),
  });
  const disconnect = useMutation<EmailConnectResponse, Error, string>({
    mutationFn: async (provider) => (await apiRequest("DELETE", `/api/email/disconnect/${provider}`)).json(),
    onSuccess: (data) => { toast({ title: "Disconnected", description: data.message }); refetch(); queryClient.invalidateQueries({ queryKey: ["/api/email/status"] }); },
  });
  const { data: outbox } = useQuery<{ enabled: boolean; messages: Array<{ id: string; to: string[]; subject: string; sentAt: string }> }>({ queryKey: ["/api/email/outbox"], enabled: !!status?.demo?.isConnected, refetchInterval: 10000 });

  const oauthCard = (p: "gmail" | "outlook", title: string, blurb: string, icon: string) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        <Badge variant={status?.[p]?.isConnected ? "default" : "secondary"}>{status?.[p]?.isConnected ? "Connected" : "Not connected"}</Badge>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">{blurb}</p>
        {status?.[p]?.email && <p className="text-xs text-muted-foreground mb-2">Connected as {status[p]!.email}</p>}
        <div className="flex gap-2">
          <Button onClick={() => connectProvider.mutate(p)} disabled={status?.[p]?.isConnected || connectProvider.isPending} data-testid={`button-connect-${p}`}>
            <i className={`${icon} mr-2`}></i>{status?.[p]?.isConnected ? "Connected" : `Connect ${title.split(" ")[0]}`}
          </Button>
          {status?.[p]?.isConnected && <Button variant="outline" onClick={() => disconnect.mutate(p)} data-testid={`button-disconnect-${p}`}>Disconnect</Button>}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {oauthCard("outlook", "Outlook / Microsoft 365", "Work or personal Microsoft account. Reads your inbox and sends through Microsoft Graph.", "fab fa-microsoft")}
      {oauthCard("gmail", "Gmail / Google Workspace", "Reads your inbox and sends through the Gmail API.", "fab fa-google")}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg">Other email (SMTP)</CardTitle>
          <Badge variant={status?.smtp?.isConnected ? "default" : "secondary"}>{status?.smtp?.isConnected ? "Connected" : "Not connected"}</Badge>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">Yahoo, iCloud, Zoho, Fastmail, a company mail server, or any provider with SMTP access. Send only (no inbox). Use an app password where the provider requires one.</p>
          {status?.smtp?.isConnected ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Sending as {status.smtp.email}</p>
              <Button variant="outline" onClick={() => disconnect.mutate("smtp")} data-testid="button-disconnect-smtp">Disconnect</Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1"><Label htmlFor="smtp-host">SMTP host</Label><Input id="smtp-host" placeholder="smtp.mail.yahoo.com" value={smtp.host} onChange={e => setSmtp({ ...smtp, host: e.target.value })} data-testid="input-smtp-host" /></div>
              <div className="grid grid-cols-2 gap-3 col-span-2 sm:col-span-1">
                <div><Label htmlFor="smtp-port">Port</Label><Input id="smtp-port" value={smtp.port} onChange={e => setSmtp({ ...smtp, port: e.target.value })} data-testid="input-smtp-port" /></div>
                <div className="flex flex-col"><Label htmlFor="smtp-secure">TLS (465)</Label><Switch id="smtp-secure" className="mt-2" checked={smtp.secure} onCheckedChange={v => setSmtp({ ...smtp, secure: v, port: v ? "465" : "587" })} /></div>
              </div>
              <div className="col-span-2 sm:col-span-1"><Label htmlFor="smtp-user">Username</Label><Input id="smtp-user" autoComplete="off" placeholder="you@company.com" value={smtp.username} onChange={e => setSmtp({ ...smtp, username: e.target.value })} data-testid="input-smtp-username" /></div>
              <div className="col-span-2 sm:col-span-1"><Label htmlFor="smtp-pass">Password / app password</Label><Input id="smtp-pass" type="password" autoComplete="new-password" value={smtp.password} onChange={e => setSmtp({ ...smtp, password: e.target.value })} data-testid="input-smtp-password" /></div>
              <div className="col-span-2"><Label htmlFor="smtp-from">From address (optional)</Label><Input id="smtp-from" placeholder="defaults to the username" value={smtp.fromAddress} onChange={e => setSmtp({ ...smtp, fromAddress: e.target.value })} data-testid="input-smtp-from" /></div>
              <div className="col-span-2">
                <Button onClick={() => connectSmtp.mutate()} disabled={connectSmtp.isPending || !smtp.host || !smtp.username || !smtp.password} data-testid="button-connect-smtp">
                  <i className="fas fa-server mr-2"></i>{connectSmtp.isPending ? "Verifying..." : "Verify and connect"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {status?.demo?.isConnected && (
        <Card data-testid="card-demo-outbox">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-lg">Demo outbox</CardTitle><Badge>Available</Badge></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">Pick "Demo outbox" as the sender in the composer. Messages are captured here instead of being delivered, so demos never send real mail.</p>
            {outbox?.messages?.length ? (
              <ul className="space-y-2 max-h-48 overflow-y-auto text-sm">
                {outbox.messages.slice(0, 10).map(m => (
                  <li key={m.id} className="border rounded p-2">
                    <div className="flex justify-between gap-2"><span className="font-medium truncate">{m.subject}</span><span className="text-xs text-muted-foreground whitespace-nowrap">{when(m.sentAt)}</span></div>
                    <div className="text-xs text-muted-foreground truncate">To: {m.to.join(", ")}</div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-muted-foreground">Nothing captured yet.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
