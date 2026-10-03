import { NextResponse } from "next/server";

import { apiError, mapServiceError, parseBody } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { authenticateApiToken, tokenHasScope } from "@/server/tokens/service";
import { recordReply } from "@/server/campaigns/service";
import { z } from "zod";

const replySchema = z.object({
  phone: z.string().trim().min(8).max(20),
  text: z.string().trim().min(1).max(2000),
  campaignId: z.string().max(64).optional(),
});

/**
 * POST /api/v1/whatsapp/reply — webhook do provedor/integração da operadora
 * (Cloud API redirecionada, gateway próprio, etc.). Registra replies,
 * para automação na resposta (auto-stop) e processa opt-out
 * ("sair"/"parar"/"stop") → lista de supressão (LGPD).
 * Auth: Bearer pgs_live_… (escopo leads:write).
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const raw = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!raw) return apiError(401, "missing_token", "Informe o header Authorization: Bearer <token>.");

  const rl = rateLimit(`v1reply:${raw.slice(0, 24)}`, 120, 60 * 1000);
  if (!rl.ok) return apiError(429, "rate_limited", "Limite de 120 replies por minuto atingido.");

  const auth = await authenticateApiToken(raw);
  if (!auth) return apiError(401, "invalid_token", "Token inválido ou revogado.");
  if (!tokenHasScope(auth, "leads:write")) {
    return apiError(403, "missing_scope", "Token sem escopo 'leads:write'.");
  }

  const { data, error } = await parseBody(req, replySchema);
  if (error) return error;

  try {
    const result = await recordReply(auth.tenantId, data.phone, data.text);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return mapServiceError(err);
  }
}
