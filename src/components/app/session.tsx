"use client";

/**
 * Sessão no cliente — contexto React (não zustand) porque o estado inicial
 * vem do servidor (SSR) por request e alimenta a troca landing ↔ workspace
 * sem risco de mismatch. ADR-003 §D7.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "member";
  status: string;
  locale: string;
  createdAt: string;
};

export type SessionTenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  leadCredits: number;
  leadCreditsUsed: number;
  seats: number;
};

export type SessionData = {
  user: SessionUser;
  tenant: SessionTenant;
};

export type AuthMode = "login" | "signup" | "invite";

type SessionContextValue = {
  session: SessionData | null;
  view: "landing" | "app";
  authOpen: boolean;
  authMode: AuthMode;
  inviteToken: string | null;
  openAuth: (mode: AuthMode) => void;
  closeAuth: () => void;
  setSession: (s: SessionData | null) => void;
  setView: (v: "landing" | "app") => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  initialSession,
  inviteToken,
  children,
}: {
  initialSession: SessionData | null;
  inviteToken: string | null;
  children: ReactNode;
}) {
  const [session, setSessionState] = useState<SessionData | null>(initialSession);
  const [view, setViewState] = useState<"landing" | "app">(initialSession ? "app" : "landing");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  const setSession = useCallback((s: SessionData | null) => {
    setSessionState(s);
    if (s) setViewState("app");
  }, []);

  const setView = useCallback((v: "landing" | "app") => {
    setViewState((prev) => (prev === v ? prev : v));
  }, []);

  const openAuth = useCallback((mode: AuthMode) => {
    setAuthMode(mode);
    setAuthOpen(true);
  }, []);

  const closeAuth = useCallback(() => setAuthOpen(false), []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      view,
      authOpen,
      authMode,
      inviteToken,
      openAuth,
      closeAuth,
      setSession,
      setView,
    }),
    [session, view, authOpen, authMode, inviteToken, openAuth, closeAuth, setSession, setView]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession deve ser usado dentro de <SessionProvider>");
  return ctx;
}

/** Traduz códigos de erro da API para a UI (o servidor envia códigos, não texto). */
export function serverErrorMessage(code: string | undefined, fallback: string): string {
  // A tradução acontece no componente via next-intl; aqui só padroniza.
  return code ?? fallback;
}
