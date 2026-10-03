"use client";

/**
 * Shell das páginas públicas de conteúdo (blog, glossário, sobre).
 *
 * - Reaproveita Header/Footer da landing (identidade visual intacta).
 * - Hidrata a sessão via /api/auth/session (CTA vira "Abrir painel" quando logado).
 * - Login/convite funcionam daqui: AuthDialog montado localmente e, no sucesso,
 *   redirecionamento para / (onde vive o workspace — sem duplicar rotas).
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthDialog } from "@/components/app/auth-dialog";
import { SessionProvider, useSession, type SessionData } from "@/components/app/session";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";

function SessionRedirect() {
  const { session, view } = useSession();
  const router = useRouter();
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!session || pushedRef.current) return;
    // Sucesso no login (setSession) ou clique em "Abrir painel" (view app)
    // → o workspace vive na rota raiz.
    if (view === "app") {
      pushedRef.current = true;
      router.push("/");
    }
  }, [session, view, router]);

  return null;
}

function SessionHydrator({ onSession }: { onSession: (session: SessionData | null) => void }) {
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current) return;
    appliedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const data = (await res.json()) as { ok?: boolean; session?: SessionData | null };
        if (!cancelled && data.ok && data.session) onSession(data.session);
      } catch {
        // Sem sessão/navegador offline → CTA de login padrão.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onSession]);

  return null;
}

export function MarketingShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);

  return (
    <SessionProvider initialSession={session} inviteToken={null}>
      <SessionHydrator onSession={setSession} />
      <SessionRedirect />
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main id="conteudo" className="flex-1">
          {children}
        </main>
        <Footer />
        <AuthDialog />
      </div>
    </SessionProvider>
  );
}
