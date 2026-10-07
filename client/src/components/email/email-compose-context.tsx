/**
 * One email composer for the whole app. Any page can call `useEmailCompose().open({...})` with a
 * prefilled draft (from a right-click on an issue, an invoice, a KPI row) and the composer opens
 * on top of wherever the user is.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import EmailComposer, { type ComposerPrefill } from "@/components/modals/email-composer";

interface Ctx {
  open: (prefill?: ComposerPrefill) => void;
  close: () => void;
  isOpen: boolean;
}

const EmailComposeContext = createContext<Ctx | null>(null);

export function EmailComposeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; prefill?: ComposerPrefill; key: number }>({ open: false, key: 0 });
  const open = useCallback((prefill?: ComposerPrefill) => setState(s => ({ open: true, prefill, key: s.key + 1 })), []);
  const close = useCallback(() => setState(s => ({ ...s, open: false })), []);
  const value = useMemo(() => ({ open, close, isOpen: state.open }), [open, close, state.open]);
  return (
    <EmailComposeContext.Provider value={value}>
      {children}
      <EmailComposer key={state.key} isOpen={state.open} onClose={close} initial={state.prefill} />
    </EmailComposeContext.Provider>
  );
}

export function useEmailCompose(): Ctx {
  const ctx = useContext(EmailComposeContext);
  if (!ctx) throw new Error("useEmailCompose must be used inside EmailComposeProvider");
  return ctx;
}
