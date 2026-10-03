import { gzipSync } from "node:zlib";
import { NextResponse } from "next/server";

import { apiError, mapServiceError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { authenticateApiToken, tokenHasScope } from "@/server/tokens/service";
import { processLeadBatch } from "@/server/leads/ingest";
import { getIdempotentResponse, setIdempotentResponse } from "@/server/idempotency";
import { leadBatchSchema } from "@/shared/schemas";

/**
 * POST /api/v1/leads/batch — ingestão da extensão (Fase 3, ADR-002 §D5).
 * Auth: Bearer pgs_live_… (escopo leads:write). Rate limit 120/min por token.
 * Corpo: JSON ou gzip (`Content-Encoding: gzip`). Idempotência via
 * `Idempotency-Key` (sha256 do lote) — retry nunca duplica lead/crédito.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const raw = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!raw) {
    return apiError(401, "missing_token", "Informe o header Authorization: Bearer <token>.");
  }

  const rl = rateLimit(`v1batch:${raw.slice(0, 24)}`, 120, 60 * 1000);
  if (!rl.ok) {
    return apiError(429, "rate_limited", "Limite de 120 lotes por minuto atingido.");
  }

  const auth = await authenticateApiToken(raw);
  if (!auth) return apiError(401, "invalid_token", "Token inválido ou revogado.");
  if (!tokenHasScope(auth, "leads:write")) {
    return apiError(403, "missing_scope", "Token sem escopo 'leads:write'.");
  }

  // Idempotência em nível de lote
  const idempotencyKey = req.headers.get("idempotency-key");
  if (idempotencyKey && /^[a-f0-9]{16,128}$/i.test(idempotencyKey)) {
    const cached = getIdempotentResponse(`${auth.tenantId}:${idempotencyKey}`);
    if (cached) {
      return new NextResponse(cached.json, {
        status: cached.status,
        headers: { "Content-Type": "application/json", "X-Idempotent-Replay": "true" },
      });
    }
  }

  // Corpo (JSON puro ou gzip)
  let json: unknown;
  try {
    const encoding = req.headers.get("content-encoding") ?? "";
    if (encoding.includes("gzip")) {
      const { gunzipSync } = await import("node:zlib");
      const buf = Buffer.from(await req.arrayBuffer());
      json = JSON.parse(gunzipSync(buf).toString("utf8"));
    } else {
      json = await req.json();
    }
  } catch {
    return apiError(400, "invalid_json", "Corpo da requisição inválido.");
  }

  const parsed = leadBatchSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first?.path?.join(".") ?? "body";
    return apiError(422, "validation_error", `Campo inválido: ${field} — ${first?.message ?? "revise os dados"}`);
  }

  try {
    const outcome = await processLeadBatch(auth.tenantId, parsed.data.leads);
    const status = outcome.blocked ? 402 : 200;
    const body = JSON.stringify(
      outcome.blocked
        ? {
            ok: false,
            error: {
              code: "credits_exhausted",
              message: "Créditos de lead esgotados. A extensão pode manter a fila local e retomar após recarga.",
            },
            created: outcome.created,
            updated: outcome.updated,
            duplicatesInBatch: outcome.duplicatesInBatch,
            credits: { remaining: 0 },
          }
        : {
            ok: true,
            created: outcome.created,
            updated: outcome.updated,
            duplicatesInBatch: outcome.duplicatesInBatch,
            credits: { remaining: outcome.creditsRemaining },
            strategyStats: outcome.strategyStats,
          }
    );
    if (idempotencyKey && /^[a-f0-9]{16,128}$/i.test(idempotencyKey)) {
      setIdempotentResponse(`${auth.tenantId}:${idempotencyKey}`, status, body);
    }
    return new NextResponse(body, { status, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    if (err instanceof Error && err.message === "tenant_not_found") {
      return apiError(404, "tenant_not_found", "Organização não encontrada.");
    }
    return mapServiceError(err);
  }
}

/** GET informativo para diagnóstico da conexão (usado pelo smoke da extensão). */
export async function GET() {
  return NextResponse.json(
    { ok: true, endpoint: "leads/batch", method: "POST", auth: "Bearer pgs_live_…", maxBatch: 200, gzip: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
