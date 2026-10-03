import { NextResponse } from "next/server";

import { getAuthContext, forbidden } from "@/server/auth/guard";
import { mapServiceError, parseBody, apiError } from "@/server/http";
import { listSearches } from "@/server/searches/service";
import { createSearchSchema } from "@/shared/schemas";
import { db } from "@/lib/db";
import { tenantDb } from "@/server/tenancy/tenant-guard";

/**
 * GET  /api/searches — lista buscas do tenant (Fase 5).
 * POST /api/searches — cria busca planejada (owner/admin). Fica "queued" na
 * fila que a extensão assume (POST /api/v1/search/claim) ou pode ser
 * executada pelo próprio navegador da operação.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  try {
    const searches = await listSearches(auth.payload.tid);
    return NextResponse.json({ ok: true, searches });
  } catch (err) {
    return mapServiceError(err);
  }
}

export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role === "member") {
    return forbidden("forbidden", "Apenas owner/admin podem criar buscas.");
  }
  const { data, error } = await parseBody(req, createSearchSchema);
  if (error) return error;

  try {
    const tdb = tenantDb(auth.payload.tid);
    const { centerLat, centerLng, radiusKm, term, speedMode, maxDepth } = data;
    const search = await tdb.search.create({
      data: {
        tenantId: auth.payload.tid,
        term,
        status: "queued",
        speedMode,
        centerLat: centerLat ?? null,
        centerLng: centerLng ?? null,
        radiusKm,
        maxDepth,
        createdById: auth.payload.uid,
        bboxJson:
          centerLat !== undefined && centerLng !== undefined
            ? JSON.stringify({
                latMin: centerLat - radiusKm / 111.32,
                latMax: centerLat + radiusKm / 111.32,
                lngMin: centerLng - radiusKm / (111.32 * Math.max(Math.cos((centerLat * Math.PI) / 180), 0.01)),
                lngMax: centerLng + radiusKm / (111.32 * Math.max(Math.cos((centerLat * Math.PI) / 180), 0.01)),
              })
            : null,
      },
    });
    await tdb.activity.create({
      data: {
        tenantId: auth.payload.tid,
        userId: auth.payload.uid,
        type: "search.created",
        dataJson: JSON.stringify({ searchId: search.id, term, speedMode }),
      },
    });
    return NextResponse.json({
      ok: true,
      search: {
        id: search.id,
        term: search.term,
        status: search.status,
        speedMode: search.speedMode,
        centerLat: search.centerLat,
        centerLng: search.centerLng,
        radiusKm: search.radiusKm,
        maxDepth: search.maxDepth,
        createdAt: search.createdAt.toISOString(),
      },
    });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** Referência viva para tipos (db usado indiretamente pelos serviços). */
void db;
