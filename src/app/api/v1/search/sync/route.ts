import { NextResponse } from "next/server";

import { apiError, mapServiceError, parseBody } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { authenticateApiToken, tokenHasScope } from "@/server/tokens/service";
import { syncSearch } from "@/server/searches/service";
import { searchSyncSchema } from "@/shared/schemas";

/**
 * POST /api/v1/search/sync — sincroniza busca e células Quadtree (Fase 3/4).
 * A extensão chama no início, a cada subdivisão e a cada conclusão de célula.
 * Upsert idempotente por extId — retomada exata após queda de conexão.
 * Auth: Bearer pgs_live_… (escopo leads:write). Rate limit 60/min por token.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const raw = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!raw) {
    return apiError(401, "missing_token", "Informe o header Authorization: Bearer <token>.");
  }

  const rl = rateLimit(`v1sync:${raw.slice(0, 24)}`, 60, 60 * 1000);
  if (!rl.ok) {
    return apiError(429, "rate_limited", "Limite de 60 sincronizações por minuto atingido.");
  }

  const auth = await authenticateApiToken(raw);
  if (!auth) return apiError(401, "invalid_token", "Token inválido ou revogado.");
  if (!tokenHasScope(auth, "leads:write")) {
    return apiError(403, "missing_scope", "Token sem escopo 'leads:write'.");
  }

  const { data, error } = await parseBody(req, searchSyncSchema);
  if (error) return error;

  try {
    const result = await syncSearch(auth.tenantId, data);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return mapServiceError(err);
  }
}
