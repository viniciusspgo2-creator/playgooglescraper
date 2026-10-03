import { NextResponse } from "next/server";

import { apiError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { authenticateApiToken, tokenHasScope } from "@/server/tokens/service";
import { db } from "@/lib/db";

/**
 * POST /api/v1/auth/verify — protocolo de conexão da extensão (spec §Protocolo).
 * Header: Authorization: Bearer pgs_live_…
 * Devolve tenant, plano, créditos e limites — a extensão mostra na Side Panel.
 * Rate limit: 60/min por token.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const raw = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!raw) {
    return apiError(401, "missing_token", "Informe o header Authorization: Bearer <token>.");
  }

  const rl = rateLimit(`v1verify:${raw.slice(0, 24)}`, 60, 60 * 1000);
  if (!rl.ok) {
    return apiError(429, "rate_limited", "Limite de 60 verificações por minuto atingido.");
  }

  const auth = await authenticateApiToken(raw);
  if (!auth) {
    return apiError(401, "invalid_token", "Token inválido ou revogado.");
  }
  if (!tokenHasScope(auth, "verify")) {
    return apiError(403, "missing_scope", "Token sem escopo 'verify'.");
  }

  const tenant = await db.tenant.findUnique({ where: { id: auth.tenantId } });
  if (!tenant) return apiError(404, "tenant_not_found", "Organização não encontrada.");

  const remaining = Math.max(tenant.leadCredits - tenant.leadCreditsUsed, 0);

  return NextResponse.json({
    ok: true,
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    plan: tenant.plan,
    credits: {
      limit: tenant.leadCredits,
      used: tenant.leadCreditsUsed,
      remaining,
    },
    limits: {
      seats: tenant.seats,
      // Limite diário de leads por plano (Fase 8 parametriza por plano; null = ilimitado no trial)
      dailyLeads: null,
    },
    token: {
      scopes: auth.scopes,
    },
  });
}
