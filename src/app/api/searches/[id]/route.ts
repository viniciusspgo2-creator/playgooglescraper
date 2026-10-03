import { NextResponse } from "next/server";

import { getAuthContext, forbidden } from "@/server/auth/guard";
import { mapServiceError, parseBody, apiError } from "@/server/http";
import { updateSearchSchema } from "@/shared/schemas";
import { tenantDb } from "@/server/tenancy/tenant-guard";

type Params = { params: Promise<{ id: string }> };

/** GET /api/searches/[id] — detalhe da busca + células (mapa do Quadtree). */
export async function GET(_req: Request, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  const { id } = await params;
  try {
    const tdb = tenantDb(auth.payload.tid);
    const search = await tdb.search.findFirst({ where: { id } });
    if (!search) return apiError(404, "not_found", "Busca não encontrada.");
    const cells = await tdb.searchCell.findMany({
      where: { searchId: search.id },
      orderBy: [{ depth: "asc" }, { createdAt: "asc" }],
      take: 2000,
    });
    return NextResponse.json({
      ok: true,
      search: {
        id: search.id,
        term: search.term,
        status: search.status,
        speedMode: search.speedMode,
        bbox: search.bboxJson ? (JSON.parse(search.bboxJson) as unknown) : null,
        centerLat: search.centerLat,
        centerLng: search.centerLng,
        radiusKm: search.radiusKm,
        maxDepth: search.maxDepth,
        extId: search.extId,
        cellsTotal: search.cellsTotal,
        cellsDone: search.cellsDone,
        leadsFound: search.leadsFound,
        startedAt: search.startedAt?.toISOString() ?? null,
        finishedAt: search.finishedAt?.toISOString() ?? null,
        lastError: search.lastError,
        createdAt: search.createdAt.toISOString(),
      },
      cells: cells.map((c) => ({
        id: c.id,
        depth: c.depth,
        latMin: c.latMin,
        lngMin: c.lngMin,
        latMax: c.latMax,
        lngMax: c.lngMax,
        status: c.status,
        found: c.found,
        attempts: c.attempts,
        lastError: c.lastError,
        extId: c.extId,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** PATCH /api/searches/[id] — pausar/retomar/cancelar/fechar (owner/admin). */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role === "member") return forbidden();
  const { id } = await params;
  const { data, error } = await parseBody(req, updateSearchSchema);
  if (error) return error;
  try {
    const tdb = tenantDb(auth.payload.tid);
    const search = await tdb.search.findFirst({ where: { id }, select: { id: true, status: true, startedAt: true } });
    if (!search) return apiError(404, "not_found", "Busca não encontrada.");
    await tdb.search.updateMany({
      where: { id: search.id },
      data: {
        status: data.status,
        ...(data.status === "running" && !search.startedAt ? { startedAt: new Date() } : {}),
        ...(["done", "failed", "cancelled"].includes(data.status) ? { finishedAt: new Date() } : {}),
      },
    });
    await tdb.activity.create({
      data: {
        tenantId: auth.payload.tid,
        userId: auth.payload.uid,
        type: "search.status_changed",
        dataJson: JSON.stringify({ searchId: search.id, from: search.status, to: data.status }),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** DELETE /api/searches/[id] — remove busca e células (leads permanecem). */
export async function DELETE(_req: Request, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role === "member") return forbidden();
  const { id } = await params;
  try {
    const tdb = tenantDb(auth.payload.tid);
    const search = await tdb.search.findFirst({ where: { id }, select: { id: true } });
    if (!search) return apiError(404, "not_found", "Busca não encontrada.");
    await tdb.search.deleteMany({ where: { id: search.id } });
    await tdb.activity.create({
      data: {
        tenantId: auth.payload.tid,
        userId: auth.payload.uid,
        type: "search.deleted",
        dataJson: JSON.stringify({ searchId: search.id }),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapServiceError(err);
  }
}
