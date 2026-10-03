/**
 * Sincronização de busca/células (Fase 3) — POST /api/v1/search/sync.
 * A extensão é a fonte de execução; o servidor é a fonte de VERDADE do estado
 * persistido (retomada exata após queda — spec §Resiliência). Upserts por
 * extId (ID local do browser), idempotentes.
 */
import { db } from "@/lib/db";
import { tenantDb } from "@/server/tenancy/tenant-guard";
import type { SearchSyncInput } from "@/shared/schemas";

export type SyncResult = {
  search: {
    id: string;
    extId: string;
    status: string;
    cellsTotal: number;
    cellsDone: number;
    leadsFound: number;
  };
  cells: Array<{ extId: string; id: string; status: string }>;
};

export async function syncSearch(tenantId: string, input: SearchSyncInput): Promise<SyncResult> {
  const tdb = tenantDb(tenantId);
  const { search, cells } = input;

  // ── Search: upsert por (tenantId, extId)
  const existingSearch = await tdb.search.findFirst({ where: { extId: search.extId } });
  let searchId: string;

  if (!existingSearch) {
    const created = await tdb.search.create({
      data: {
        tenantId,
        extId: search.extId,
        term: search.term,
        status: search.status ?? "running",
        speedMode: search.speedMode ?? "moderate",
        bboxJson: search.bbox ? JSON.stringify(search.bbox) : null,
        centerLat: search.centerLat ?? null,
        centerLng: search.centerLng ?? null,
        radiusKm: search.radiusKm ?? null,
        maxDepth: search.maxDepth ?? 4,
        cellsTotal: search.cellsTotal ?? 0,
        cellsDone: search.cellsDone ?? 0,
        leadsFound: search.leadsFound ?? 0,
        startedAt: new Date(),
      },
    });
    searchId = created.id;
    await tdb.activity.create({
      data: {
        tenantId,
        type: "search.started",
        dataJson: JSON.stringify({ searchId, term: search.term, speedMode: search.speedMode ?? "moderate" }),
      },
    });
  } else {
    searchId = existingSearch.id;
    const finished = search.status === "done" || search.status === "failed" || search.status === "cancelled";
    await tdb.search.updateMany({
      where: { id: searchId },
      data: {
        status: search.status ?? existingSearch.status,
        cellsTotal: search.cellsTotal ?? existingSearch.cellsTotal,
        cellsDone: search.cellsDone ?? existingSearch.cellsDone,
        leadsFound: search.leadsFound ?? existingSearch.leadsFound,
        lastError: search.lastError ?? existingSearch.lastError,
        ...(finished && !existingSearch.finishedAt ? { finishedAt: new Date() } : {}),
      },
    });
    if (search.status === "done" && existingSearch.status !== "done") {
      await tdb.activity.create({
        data: {
          tenantId,
          type: "search.completed",
          dataJson: JSON.stringify({ searchId, term: search.term, leadsFound: search.leadsFound ?? existingSearch.leadsFound }),
        },
      });
    }
  }

  // ── Cells: upsert por (tenantId, extId), preservando searchId correto
  const cellMap: SyncResult["cells"] = [];
  const existingCells = cells.length > 0
    ? await tdb.searchCell.findMany({ where: { extId: { in: cells.map((c) => c.extId) } } })
    : [];
  const existingByExt = new Map(existingCells.map((c) => [c.extId, c]));

  for (const cell of cells) {
    const existing = existingByExt.get(cell.extId);
    if (existing) {
      await tdb.searchCell.updateMany({
        where: { id: existing.id },
        data: {
          status: cell.status ?? existing.status,
          found: cell.found ?? existing.found,
          attempts: cell.attempts ?? existing.attempts,
          lastError: cell.lastError ?? existing.lastError,
        },
      });
      cellMap.push({ extId: cell.extId, id: existing.id, status: cell.status ?? existing.status });
    } else {
      const createdCell = await tdb.searchCell.create({
        data: {
          tenantId,
          searchId,
          extId: cell.extId,
          depth: cell.depth,
          latMin: cell.latMin,
          lngMin: cell.lngMin,
          latMax: cell.latMax,
          lngMax: cell.lngMax,
          status: cell.status ?? "pending",
          found: cell.found ?? 0,
          attempts: cell.attempts ?? 0,
          lastError: cell.lastError ?? null,
        },
      });
      cellMap.push({ extId: cell.extId, id: createdCell.id, status: createdCell.status });
    }
  }

  const fresh = await tdb.search.findFirst({ where: { id: searchId }, select: { status: true, cellsTotal: true, cellsDone: true, leadsFound: true } });

  return {
    search: {
      id: searchId,
      extId: search.extId,
      status: fresh?.status ?? "running",
      cellsTotal: fresh?.cellsTotal ?? 0,
      cellsDone: fresh?.cellsDone ?? 0,
      leadsFound: fresh?.leadsFound ?? 0,
    },
    cells: cellMap,
  };
}

/** Buscas do painel — listagem com contagens derivadas de leads reais. */
export async function listSearches(tenantId: string, limit = 50) {
  const tdb = tenantDb(tenantId);
  const searches = await tdb.search.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const leadCounts = await tdb.lead.groupBy({
    by: ["searchId"],
    where: { searchId: { in: searches.map((s) => s.id) } },
    _count: { _all: true },
  });
  const countBySearch = new Map(leadCounts.map((c) => [c.searchId, c._count._all]));
  return searches.map((s) => ({
    id: s.id,
    term: s.term,
    status: s.status,
    speedMode: s.speedMode,
    centerLat: s.centerLat,
    centerLng: s.centerLng,
    radiusKm: s.radiusKm,
    maxDepth: s.maxDepth,
    cellsTotal: s.cellsTotal,
    cellsDone: s.cellsDone,
    leadsFound: s.leadsFound,
    leadsActual: countBySearch.get(s.id) ?? 0,
    startedAt: s.startedAt?.toISOString() ?? null,
    finishedAt: s.finishedAt?.toISOString() ?? null,
    lastError: s.lastError,
    createdAt: s.createdAt.toISOString(),
  }));
}
