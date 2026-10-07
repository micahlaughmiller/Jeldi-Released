import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EmailStatusResponse, EmailProviderName } from "@shared/schema";

export interface ComposerPrefill {
  to?: string[];
  cc?: string[];
  subject?: string;
  body?: string;
  related?: { kind: string; id: string; title: string };
}

interface EmailComposerProps {
  isOpen: boolean;
  onClose: () => void;
  initial?: ComposerPrefill;
}

interface DirectoryEntry { name: string; email: string; group: "organization" | "customers"; detail?: string }

const PROVIDER_ORDER: EmailProviderName[] = ["outlook", "gmail", "smtp", "demo"];
const PROVIDER_LABEL: Record<EmailProviderName, string> = { outlook: "Outlook / Microsoft 365", gmail: "Gmail", smtp: "SMTP (other email)", demo: "Demo outbox (not delivered)" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Chips for chosen addresses plus a text box that suggests people from the organization directory */
function RecipientField({ id, label, value, onChange, directory, placeholder }: { id: string; label: string; value: string[]; onChange: (v: string[]) => void; directory: DirectoryEntry[]; placeholder?: string }) {
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const q = text.trim().toLowerCase();
  const suggestions = useMemo(() => {
    const chosen = new Set(value.map(v => v.toLowerCase()));
    return directory.filter(d => !chosen.has(d.email.toLowerCase()) && (!q || d.name.toLowerCase().includes(q) || d.email.toLowerCase().includes(q))).slice(0, 8);
  }, [directory, value, q]);
  const add = (email: string) => { const e = email.trim().replace(/[,;]$/, ""); if (!e) return; if (!value.includes(e)) onChange([...value, e]); setText(""); };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === "," || e.key === ";" || e.key === "Tab") && text.trim()) { e.preventDefault(); add(suggestions.length && !EMAIL_RE.test(text.trim()) ? suggestions[0].email : text); }
    else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
    else if (e.key === "Escape") setFocus(false);
  };
  return (
    <div ref={boxRef} className="relative">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap items-center gap-1 rounded-md border bg-background px-2 py-1 min-h-10 focus-within:ring-2 focus-within:ring-ring" onClick={() => document.getElementById(id)?.focus()}>
        {value.map(v => (
          <Badge key={v} variant={EMAIL_RE.test(v) ? "secondary" : "destructive"} className="gap-1 font-normal" data-testid={`chip-${id}-${v}`}>
            {directory.find(d => d.email.toLowerCase() === v.toLowerCase())?.name ?? v}
            <button type="button" className="ml-1 opacity-70 hover:opacity-100" onClick={e => { e.stopPropagation(); onChange(value.filter(x => x !== v)); }} aria-label={`Remove ${v}`}>×</button>
          </Badge>
        ))}
        <input id={id} className="flex-1 min-w-[12rem] bg-transparent outline-none text-sm py-1" placeholder={value.length ? "" : placeholder} value={text}
          onChange={e => setText(e.target.value)} onKeyDown={onKey} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} autoComplete="off" data-testid={`input-${id}`} />
      </div>
      {focus && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-56 overflow-auto" data-testid={`suggestions-${id}`}>
          {suggestions.map(d => (
            <li key={d.email}>
              <button type="button" className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex justify-between gap-2" onMouseDown={e => e.preventDefault()} onClick={() => add(d.email)}>
                <span className="truncate"><span className="font-medium">{d.name}</span> <span className="text-muted-foreground">{d.email}</span></span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{d.group === "organization" ? "team" : d.detail ?? "customer"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function EmailComposer({ isOpen, onClose, initial }: EmailComposerProps) {
  const [provider, setProvider] = useState<EmailProviderName>("outlook");
  const [to, setTo] = useState<string[]>(initial?.to ?? []);
  const [cc, setCc] = useState<string[]>(initial?.cc ?? []);
  const [showCc, setShowCc] = useState(Boolean(initial?.cc?.length));
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: emailStatus } = useQuery<EmailStatusResponse>({ queryKey: ["/api/email/status"], enabled: isOpen });
  const { data: directory = [] } = useQuery<DirectoryEntry[]>({ queryKey: ["/api/email/directory"], enabled: isOpen, staleTime: 60_000 });

  // Sign the message with the sender's name when the draft left a placeholder
  useEffect(() => {
    if (!isOpen) return;
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      const name = u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username || u.email;
      if (name && body.endsWith("\nRegards")) setBody(b => `${b},\n${name}`);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/email/send", { provider, to, cc: cc.length ? cc : undefined, subject, body, isHtml: false, related: initial?.related });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Email sent", description: `To ${to.join(", ")}` });
      queryClient.invalidateQueries({ queryKey: ["/api/email/sent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/outbox"] });
      onClose();
    },
    onError: (error: any) => toast({ title: "Failed to send email", description: error.message || "Failed to send email", variant: "destructive" }),
  });

  const connected = PROVIDER_ORDER.filter(p => emailStatus?.[p]?.isConnected);
  const providerAvailable = Boolean(emailStatus?.[provider]?.isConnected);
  const badAddress = [...to, ...cc].find(a => !EMAIL_RE.test(a));

  const handleSend = () => {
    if (!to.length || !subject.trim() || !body.trim()) { toast({ title: "Missing fields", description: "Add at least one recipient, a subject and a message", variant: "destructive" }); return; }
    if (badAddress) { toast({ title: "Check the address", description: `${badAddress} does not look like an email address`, variant: "destructive" }); return; }
    if (!providerAvailable) { toast({ title: "No email account connected", description: "Connect Outlook, Gmail or SMTP on the Email page first", variant: "destructive" }); return; }
    sendEmailMutation.mutate();
  };

  // Pick the first connected provider when the current one is not connected
  useEffect(() => {
    if (!emailStatus || emailStatus[provider]?.isConnected) return;
    const first = PROVIDER_ORDER.find(p => emailStatus[p]?.isConnected);
    if (first) setProvider(first);
  }, [emailStatus, provider]);

  return (
    <Dialog open={isOpen} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-auto" data-testid="email-composer-modal">
        <DialogHeader>
          <DialogTitle>{initial?.related ? `Email about ${initial.related.title}` : "New email"}</DialogTitle>
          <DialogDescription>
            {initial?.related ? "The record's details are written into the message below. Edit anything before sending." : "Sent from your connected account without leaving Jeldi."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <Label>Send from</Label>
              <Select value={provider} onValueChange={(value) => setProvider(value as EmailProviderName)}>
                <SelectTrigger data-testid="select-email-provider"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDER_ORDER.filter(p => p !== "demo" || emailStatus?.demo?.isConnected).map(p => (
                    <SelectItem key={p} value={p} disabled={!emailStatus?.[p]?.isConnected}>
                      {PROVIDER_LABEL[p]}{emailStatus?.[p]?.email ? ` · ${emailStatus[p]!.email}` : ""}{emailStatus?.[p]?.isConnected ? "" : " (not connected)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {emailStatus && connected.length === 0 && <p className="text-sm text-destructive">No account connected yet. Open Email → Accounts.</p>}
          </div>

          <RecipientField id="email-to" label="To" value={to} onChange={setTo} directory={directory} placeholder="Type a name from your organization, a customer, or any address" />
          {showCc ? (
            <RecipientField id="email-cc" label="Cc" value={cc} onChange={setCc} directory={directory} placeholder="Optional" />
          ) : (
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowCc(true)} data-testid="button-show-cc">+ Cc</button>
          )}

          <div>
            <Label htmlFor="email-subject">Subject</Label>
            <Input id="email-subject" value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="input-email-subject" />
          </div>

          <div>
            <Label htmlFor="email-body">Message</Label>
            <Textarea id="email-body" rows={initial?.body ? 14 : 8} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-sm" data-testid="textarea-email-body" />
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {initial?.related ? "Plain text, no links: the reader needs nothing but this email." : "Plain text."}
            </p>
            <div className="flex items-center space-x-3">
              <Button variant="outline" onClick={onClose} data-testid="button-cancel-email">Cancel</Button>
              <Button onClick={handleSend} disabled={sendEmailMutation.isPending} data-testid="button-send-email">
                {sendEmailMutation.isPending ? <><i className="fas fa-spinner fa-spin mr-2"></i>Sending...</> : <><i className="fas fa-paper-plane mr-2"></i>Send</>}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
