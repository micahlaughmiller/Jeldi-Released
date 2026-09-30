import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Building2, Users, UserPlus, Bot, Copy, Trash2, Check } from "lucide-react";

interface CurrentOrg {
  organization: { id: string; name: string; displayName: string; logo: string | null; website: string | null; settings: any; aiProvider: string; aiModel: string | null; plan: string; planStatus: string };
  orgRole: "owner" | "admin" | "member";
  memberRole: string | null;
  aiKeyHint: string | null;
  aiSource: "organization" | "platform" | "none";
  canManage: boolean;
}
interface Member { userId: string; username: string; email: string; isOwner: boolean; roleName: string | null; joinedAt: string }
interface Invitation { id: string; email: string; roleName: string; token: string; expiresAt: string; acceptedAt: string | null; link: string }
interface OrgSummary { id: string; displayName: string; memberCount: number; isCurrent: boolean }

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", ops_manager: "Operations manager", finance: "Finance", cfo: "CFO", project_manager: "Project manager",
  cost_manager: "Cost manager", sales: "Sales", marketing: "Marketing", user: "Viewer",
};
const MODEL_HINTS: Record<string, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
  anthropic: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
};

export default function OrganizationSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: current, isLoading } = useQuery<CurrentOrg>({ queryKey: ["/api/organizations/current"] });
  const { data: members } = useQuery<Member[]>({ queryKey: ["/api/organizations/current/members"], enabled: !!current });
  const { data: invitations } = useQuery<Invitation[]>({ queryKey: ["/api/organizations/current/invitations"], enabled: !!current?.canManage });
  const { data: mine } = useQuery<OrgSummary[]>({ queryKey: ["/api/organizations/mine"] });

  const [profile, setProfile] = useState({ displayName: "", website: "", logo: "", primaryColor: "" });
  const [invite, setInvite] = useState({ email: "", roleName: "user" });
  const [ai, setAi] = useState({ provider: "none", apiKey: "", model: "" });
  const [newOrgName, setNewOrgName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!current) return;
    setProfile({
      displayName: current.organization.displayName ?? "",
      website: current.organization.website ?? "",
      logo: current.organization.logo ?? "",
      primaryColor: current.organization.settings?.branding?.primaryColor ?? "",
    });
    setAi({ provider: current.organization.aiProvider || "none", apiKey: "", model: current.organization.aiModel ?? "" });
  }, [current]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/organizations/current"] });
    qc.invalidateQueries({ queryKey: ["/api/organizations/current/members"] });
    qc.invalidateQueries({ queryKey: ["/api/organizations/current/invitations"] });
    qc.invalidateQueries({ queryKey: ["/api/organizations/mine"] });
  };
  const fail = (title: string) => (error: any) => toast({ title, description: error.message, variant: "destructive" });

  const saveProfile = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/organizations/current", { displayName: profile.displayName, website: profile.website || null, logo: profile.logo || null, branding: { primaryColor: profile.primaryColor || null } }),
    onSuccess: () => { toast({ title: "Organization updated" }); refresh(); },
    onError: fail("Could not save organization"),
  });
  const sendInvite = useMutation({
    mutationFn: () => apiRequest("POST", "/api/organizations/current/invitations", invite).then(r => r.json()),
    onSuccess: (inv: Invitation) => { toast({ title: "Invitation created", description: `Send ${inv.email} the link shown below.` }); setInvite({ email: "", roleName: "user" }); refresh(); },
    onError: fail("Could not create invitation"),
  });
  const revokeInvite = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/organizations/current/invitations/${id}`),
    onSuccess: refresh, onError: fail("Could not revoke invitation"),
  });
  const setRole = useMutation({
    mutationFn: ({ userId, roleName }: { userId: string; roleName: string }) => apiRequest("PUT", `/api/organizations/current/members/${userId}`, { roleName }),
    onSuccess: () => { toast({ title: "Role updated" }); refresh(); }, onError: fail("Could not change role"),
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) => apiRequest("DELETE", `/api/organizations/current/members/${userId}`),
    onSuccess: () => { toast({ title: "Member removed" }); refresh(); }, onError: fail("Could not remove member"),
  });
  const testAi = useMutation({
    mutationFn: () => apiRequest("POST", "/api/organizations/current/ai/test", { provider: ai.provider, apiKey: ai.apiKey || undefined, model: ai.model || undefined }).then(r => r.json()),
    onSuccess: (r: { model: string }) => toast({ title: "AI key works", description: `Answered by ${r.model}` }),
    onError: fail("AI test failed"),
  });
  const saveAi = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/organizations/current/ai", { provider: ai.provider, apiKey: ai.apiKey || undefined, model: ai.model || undefined }),
    onSuccess: () => { toast({ title: "AI settings saved" }); setAi(a => ({ ...a, apiKey: "" })); refresh(); },
    onError: fail("Could not save AI settings"),
  });
  const switchOrg = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/organizations/${id}/switch`),
    onSuccess: () => { qc.clear(); window.location.reload(); }, onError: fail("Could not switch organization"),
  });
  const createOrg = useMutation({
    mutationFn: () => apiRequest("POST", "/api/organizations", { name: newOrgName.toLowerCase().replace(/[^a-z0-9]+/g, "-"), displayName: newOrgName }).then(r => r.json()),
    onSuccess: (org: { id: string }) => { setNewOrgName(""); switchOrg.mutate(org.id); }, onError: fail("Could not create organization"),
  });

  const copy = async (text: string, id: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch { toast({ title: "Copy failed", description: text }); }
  };

  if (isLoading || !current) return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  const canManage = current.canManage;

  return (
    <div className="space-y-6" data-testid="organization-settings">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> {current.organization.displayName}</CardTitle>
          <CardDescription>
            You are {current.orgRole === "owner" ? "the owner" : current.orgRole === "admin" ? "an admin" : "a member"}
            {current.memberRole && current.orgRole !== "owner" ? ` (${ROLE_LABELS[current.memberRole] ?? current.memberRole})` : ""}.
            Plan: <Badge variant="secondary">{current.organization.plan}</Badge>
          </CardDescription>
        </CardHeader>
        {canManage && (
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="org-display">Company name</Label><Input id="org-display" value={profile.displayName} onChange={e => setProfile({ ...profile, displayName: e.target.value })} data-testid="input-org-display-name" /></div>
            <div><Label htmlFor="org-website">Website</Label><Input id="org-website" placeholder="https://" value={profile.website} onChange={e => setProfile({ ...profile, website: e.target.value })} /></div>
            <div><Label htmlFor="org-logo">Logo URL</Label><Input id="org-logo" placeholder="https://…/logo.png" value={profile.logo} onChange={e => setProfile({ ...profile, logo: e.target.value })} /></div>
            <div><Label htmlFor="org-color">Accent colour</Label><Input id="org-color" placeholder="#2563eb" value={profile.primaryColor} onChange={e => setProfile({ ...profile, primaryColor: e.target.value })} /></div>
            <div className="sm:col-span-2"><Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending || !profile.displayName.trim()} data-testid="button-save-org">Save</Button></div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> AI provider</CardTitle>
          <CardDescription>
            The AI assistant and insights run on your organization's own API key, billed to your account.
            {current.aiSource === "platform" && " This demo is currently using the platform's key."}
            {current.aiSource === "none" && " No key is configured, so AI features are off."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManage ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Provider</Label>
                  <Select value={ai.provider} onValueChange={v => setAi({ provider: v, apiKey: "", model: "" })}>
                    <SelectTrigger data-testid="select-ai-provider"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Off</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {ai.provider !== "none" && (
                  <>
                    <div>
                      <Label htmlFor="ai-key">API key {current.aiKeyHint && current.organization.aiProvider === ai.provider ? <span className="text-muted-foreground">(saved {current.aiKeyHint})</span> : null}</Label>
                      <Input id="ai-key" type="password" autoComplete="off" placeholder={current.aiKeyHint ? "leave blank to keep" : ai.provider === "openai" ? "sk-…" : "sk-ant-…"} value={ai.apiKey} onChange={e => setAi({ ...ai, apiKey: e.target.value })} data-testid="input-ai-key" />
                    </div>
                    <div>
                      <Label htmlFor="ai-model">Model</Label>
                      <Input id="ai-model" list="ai-model-hints" placeholder={MODEL_HINTS[ai.provider]?.[0]} value={ai.model} onChange={e => setAi({ ...ai, model: e.target.value })} />
                      <datalist id="ai-model-hints">{(MODEL_HINTS[ai.provider] ?? []).map(m => <option key={m} value={m} />)}</datalist>
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {ai.provider !== "none" && <Button variant="outline" onClick={() => testAi.mutate()} disabled={testAi.isPending || (!ai.apiKey && !current.aiKeyHint)} data-testid="button-test-ai">{testAi.isPending ? "Testing…" : "Test key"}</Button>}
                <Button onClick={() => saveAi.mutate()} disabled={saveAi.isPending || (ai.provider !== "none" && !ai.apiKey && !current.aiKeyHint)} data-testid="button-save-ai">Save</Button>
              </div>
              <p className="text-xs text-muted-foreground">Keys are stored encrypted and never shown again. Get one at platform.openai.com or console.anthropic.com.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Provider: {current.organization.aiProvider === "none" ? "off" : current.organization.aiProvider}. Ask an organization admin to change it.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Members</CardTitle>
          <CardDescription>People who can sign in to this organization and what they may do.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg divide-y">
            {(members ?? []).map(m => (
              <div key={m.userId} className="flex flex-wrap items-center gap-3 p-3" data-testid={`member-${m.email}`}>
                <div className="flex-1 min-w-[180px]">
                  <div className="font-medium">{m.username} {m.isOwner && <Badge className="ml-1">Owner</Badge>}</div>
                  <div className="text-xs text-muted-foreground">{m.email}</div>
                </div>
                {canManage && !m.isOwner ? (
                  <Select value={m.roleName ?? "user"} onValueChange={roleName => setRole.mutate({ userId: m.userId, roleName })}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(ROLE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary">{m.isOwner ? "Owner" : ROLE_LABELS[m.roleName ?? "user"] ?? m.roleName}</Badge>
                )}
                {canManage && !m.isOwner && (
                  <Button variant="ghost" size="icon" onClick={() => removeMember.mutate(m.userId)} title="Remove from organization"><Trash2 className="h-4 w-4" /></Button>
                )}
              </div>
            ))}
          </div>

          {canManage && (
            <>
              <Separator />
              <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto] items-end">
                <div><Label htmlFor="invite-email">Invite by email</Label><Input id="invite-email" type="email" placeholder="colleague@company.com" value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} data-testid="input-invite-email" /></div>
                <div>
                  <Label>Role</Label>
                  <Select value={invite.roleName} onValueChange={roleName => setInvite({ ...invite, roleName })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(ROLE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button onClick={() => sendInvite.mutate()} disabled={sendInvite.isPending || !invite.email.includes("@")} data-testid="button-send-invite"><UserPlus className="h-4 w-4 mr-2" />Create invite</Button>
              </div>
              {(invitations ?? []).filter(i => !i.acceptedAt).length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Pending invitations</p>
                  {(invitations ?? []).filter(i => !i.acceptedAt).map(i => (
                    <div key={i.id} className="flex flex-wrap items-center gap-2 text-sm border rounded p-2" data-testid={`invite-${i.email}`}>
                      <span className="flex-1 min-w-[160px]">{i.email} <Badge variant="outline">{ROLE_LABELS[i.roleName] ?? i.roleName}</Badge></span>
                      <span className="text-xs text-muted-foreground">expires {new Date(i.expiresAt).toLocaleDateString()}</span>
                      <Button variant="outline" size="sm" onClick={() => copy(i.link, i.id)}>{copied === i.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}<span className="ml-1">Copy link</span></Button>
                      <Button variant="ghost" size="icon" onClick={() => revokeInvite.mutate(i.id)} title="Revoke"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">Send the link to the person. It works for 14 days and only for that email address.</p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {(mine?.length ?? 0) > 1 || current.orgRole === "owner" ? (
        <Card>
          <CardHeader>
            <CardTitle>Your organizations</CardTitle>
            <CardDescription>Switch between the organizations you belong to, or create another.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(mine ?? []).map(o => (
              <div key={o.id} className="flex items-center justify-between border rounded p-2 text-sm">
                <span>{o.displayName} <span className="text-muted-foreground">({o.memberCount} member{o.memberCount === 1 ? "" : "s"})</span></span>
                {o.isCurrent ? <Badge>Current</Badge> : <Button size="sm" variant="outline" onClick={() => switchOrg.mutate(o.id)}>Switch</Button>}
              </div>
            ))}
            <div className="flex gap-2 items-end">
              <div className="flex-1"><Label htmlFor="new-org">New organization</Label><Input id="new-org" placeholder="Company name" value={newOrgName} onChange={e => setNewOrgName(e.target.value)} /></div>
              <Button variant="outline" onClick={() => createOrg.mutate()} disabled={createOrg.isPending || newOrgName.trim().length < 2}>Create</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
