/**
 * Right-click menu for any row that represents a record: "Send by email" opens the composer with
 * the record's details written into the message, "Copy details" puts the same text on the
 * clipboard. A small envelope button appears on hover for mouse-less / touch users.
 */
import { createElement, type ReactNode } from "react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useEmailCompose } from "./email-compose-context";
import { useToast } from "@/hooks/use-toast";
import type { EmailDraft } from "@shared/email-format";

interface Props {
  /** Built lazily so rows stay cheap to render */
  draft: () => EmailDraft;
  /** Element to render: "tr" inside tables, "li" in lists, "div" otherwise */
  as?: "tr" | "li" | "div";
  className?: string;
  testId?: string;
  children: ReactNode;
  /** Where to put the hover envelope: last cell of a table row needs its own cell, so lists only */
  showButton?: boolean;
}

export function EmailRowMenu({ draft, as = "div", className, testId, children, showButton }: Props) {
  const { open } = useEmailCompose();
  const { toast } = useToast();
  const send = () => open(draft());
  const copy = async () => {
    const d = draft();
    try { await navigator.clipboard.writeText(`${d.subject}\n\n${d.body}`); toast({ title: "Details copied" }); }
    catch { toast({ title: "Could not copy", variant: "destructive" }); }
  };
  const button = (showButton ?? as === "li") ? (
    <button type="button" className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-foreground self-start mt-1" title="Send by email" onClick={e => { e.stopPropagation(); send(); }} data-testid={testId ? `${testId}-email` : undefined}>
      <i className="fas fa-envelope"></i>
    </button>
  ) : null;
  const el = createElement(as, { className, "data-testid": testId, title: "Right-click to send by email" }, children, button);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{el}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={send} data-testid="menu-send-email"><i className="fas fa-envelope mr-2 w-4"></i>Send by email…</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={copy}><i className="fas fa-copy mr-2 w-4"></i>Copy details</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
