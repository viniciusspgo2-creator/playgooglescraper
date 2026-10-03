import { NextResponse } from "next/server";

import { apiError, mapServiceError, parseBody } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { authenticateApiToken, tokenHasScope } from "@/server/tokens/service";
import { tenantDb } from "@/server/tenancy/tenant-guard";
import { z } from "zod";

/**
 * GET /api/v1/search/queue — buscas "queued" criadas no painel (Fase 5).
 * A extensão lista e assume uma via claim, executando no navegador do usuário.
 * Auth: Bearer pgs_live_… (escopo leads:read).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const raw = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!raw) return apiError(401, "missing_token", "Informe o header Authorization: Bearer <token>.");

  const rl = rateLimit(`v1queue:${raw.slice(0, 24)}`, 60, 60 * 1000);
  if (!rl.ok) return apiError(429, "rate_limited", "Limite de 60 consultas por minuto atingido.");

  const auth = await authenticateApiToken(raw);
  if (!auth) return apiError(401, "invalid_token", "Token inválido ou revogado.");
  if (!tokenHasScope(auth, "leads:read")) {
    return apiError(403, "missing_scope", "Token sem escopo 'leads:read'.");
  }

  try {
    const tdb = tenantDb(auth.tenantId);
    const queued = await tdb.search.findMany({
      where: { status: "queued" },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
    return NextResponse.json({
      ok: true,
      searches: queued.map((s) => ({
        id: s.id,
        term: s.term,
        speedMode: s.speedMode,
        centerLat: s.centerLat,
        centerLng: s.centerLng,
        radiusKm: s.radiusKm,
        maxDepth: s.maxDepth,
        bbox: s.bboxJson ? (JSON.parse(s.bboxJson) as unknown) : null,
        createdAt: s.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return mapServiceError(err);
  }
}

const claimSchema = z.object({
  searchId: z.string().min(1).max(64),
  extId: z.string().min(8).max(64),
});

/**
 * POST /api/v1/search/claim — a extensão assume uma busca do painel.
 * Vincula extId, marca running e devolve células já persistidas (retomada).
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const raw = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!raw) return apiError(401, "missing_token", "Informe o header Authorization: Bearer <token>.");

  const rl = rateLimit(`v1claim:${raw.slice(0, 24)}`, 60, 60 * 1000);
  if (!rl.ok) return apiError(429, "rate_limited", "Limite de 60 claims por minuto atingido.");

  const auth = await authenticateApiToken(raw);
  if (!auth) return apiError(401, "invalid_token", "Token inválido ou revogado.");
  if (!tokenHasScope(auth, "leads:write")) {
    return apiError(403, "missing_scope", "Token sem escopo 'leads:write'.");
  }

  const { data, error } = await parseBody(req, claimSchema);
  if (error) return error;

  try {
    const tdb = tenantDb(auth.tenantId);
    const search = await tdb.search.findFirst({ where: { id: data.searchId } });
    if (!search) return apiError(404, "not_found", "Busca não encontrada.");
    if (search.extId && search.extId !== data.extId) {
      return apiError(409, "conflict", "Busca já assumida por outra extensão/dispositivo.");
    }
    if (!["queued", "running", "paused"].includes(search.status)) {
      return apiError(409, "conflict", `Busca em status ${search.status} não pode ser assumida.`);
    }
    await tdb.search.updateMany({
      where: { id: search.id },
      data: { extId: data.extId, status: "running", startedAt: search.startedAt ?? new Date() },
    });
    const cells = await tdb.searchCell.findMany({ where: { searchId: search.id }, take: 500 });
    await tdb.activity.create({
      data: {
        tenantId: auth.tenantId,
        type: "search.claimed",
        dataJson: JSON.stringify({ searchId: search.id, extId: data.extId }),
      },
    });
    return NextResponse.json({
      ok: true,
      search: {
        id: search.id,
        term: search.term,
        status: "running",
        speedMode: search.speedMode,
        maxDepth: search.maxDepth,
        centerLat: search.centerLat,
        centerLng: search.centerLng,
        radiusKm: search.radiusKm,
        bbox: search.bboxJson ? (JSON.parse(search.bboxJson) as unknown) : null,
        cellsTotal: search.cellsTotal,
        cellsDone: search.cellsDone,
        leadsFound: search.leadsFound,
      },
      cells: cells.map((c) => ({
        extId: c.extId,
        id: c.id,
        depth: c.depth,
        latMin: c.latMin,
        lngMin: c.lngMin,
        latMax: c.latMax,
        lngMax: c.lngMax,
        status: c.status,
        found: c.found,
      })),
    });
  } catch (err) {
    return mapServiceError(err);
  }
}
