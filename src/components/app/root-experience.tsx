"use client";

/**
 * RootExperience — shell de rota única (ADR-003 §D1).
 * Alterna Landing ↔ Workspace por estado de sessão; monta o AuthDialog.
 * A sessão inicial vem do servidor (sem flash), ?invite= abre o convite.
 */
import { useEffect } from "react";

import { AuthDialog } from "@/components/app/auth-dialog";
import { SessionProvider, useSession } from "@/components/app/session";
import type { SessionData } from "@/components/app/session";
import { LandingView } from "@/components/landing/landing-view";
import { Workspace } from "@/components/app/workspace";

const HEX_16 = /^[a-f0-9]{16,128}$/;

function ViewRouter() {
  const { session, view } = useSession();
  if (view === "app" && session) return <Workspace />;
  return <LandingView />;
}

export function RootExperience({
  initialSession,
  inviteToken,
}: {
  initialSession: SessionData | null;
  inviteToken: string | null;
}) {
  return (
    <SessionProvider initialSession={initialSession} inviteToken={inviteToken}>
      <InviteOpener inviteToken={inviteToken} />
      <ViewRouter />
      <AuthDialog />
    </SessionProvider>
  );
}

/** Abre o diálogo de convite quando a URL traz ?invite=<token>. */
function InviteOpener({ inviteToken }: { inviteToken: string | null }) {
  const { openAuth } = useSession();
  useEffect(() => {
    if (!inviteToken || !HEX_16.test(inviteToken)) return;
    const id = requestAnimationFrame(() => openAuth("invite"));
    return () => cancelAnimationFrame(id);
  }, [inviteToken, openAuth]);
  return null;
}
