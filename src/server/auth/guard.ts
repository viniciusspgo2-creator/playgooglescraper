/**
 * Guard de rotas — resolve a sessão a partir do cookie e aplica papéis (Fase 2).
 * Usado por TODAS as rotas /api (painel). Rotas /api/v1/* usam tokens de API
 * (src/server/tokens/service.ts).
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from "./session";
import type { Role, SessionView } from "./service";

export type AuthContext = {
  payload: SessionPayload;
  session: SessionView;
};

export async function getAuthContext(): Promise<AuthContext | null> {
  const store = await cookies();
  const payload = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  const user = await db.user.findUnique({ where: { id: payload.uid } });
  if (!user || user.status !== "active" || user.tokenVersion !== payload.ver) return null;
  const tenant = await db.tenant.findUnique({ where: { id: payload.tid } });
  if (!tenant) return null;

  return {
    payload,
    session: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as Role,
        status: user.status,
        locale: (user.locale as SessionView["user"]["locale"]) ?? "pt-BR",
        createdAt: user.createdAt.toISOString(),
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
        leadCredits: tenant.leadCredits,
        leadCreditsUsed: tenant.leadCreditsUsed,
        seats: tenant.seats,
      },
    },
  };
}

export function unauthorized(code = "unauthorized", message = "Sessão inválida ou expirada."): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status: 401 });
}

export function forbidden(code = "forbidden", message = "Você não tem permissão para esta ação."): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status: 403 });
}

/** Exige sessão ativa; retorna contexto ou a resposta de erro pronta. */
export async function requireSession(): Promise<
  { ctx: AuthContext; error: null } | { ctx: null; error: NextResponse }
> {
  const ctx = await getAuthContext();
  if (!ctx) return { ctx: null, error: unauthorized() };
  return { ctx, error: null };
}

/** Exige um dos papéis informados. */
export function requireRole(
  ctx: AuthContext,
  roles: Role[]
): { ok: true } | { ok: false; error: NextResponse } {
  if (!roles.includes(ctx.session.user.role)) {
    return { ok: false, error: forbidden() };
  }
  return { ok: true };
}
