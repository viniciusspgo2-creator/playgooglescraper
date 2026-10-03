import { NextResponse } from "next/server";

import { getAuthContext } from "@/server/auth/guard";
import { mapServiceError, apiError } from "@/server/http";
import { buildLeadWhere, buildLeadOrder, LEAD_LIST_SELECT, leadListItem } from "@/server/leads/query";
import { listLeadsSchema } from "@/shared/schemas";
import { tenantDb } from "@/server/tenancy/tenant-guard";

/**
 * GET /api/leads — listagem server-side com filtros e paginação (Fase 5).
 * Query: q, stage, temperature, hasSite, minHeat, maxHeat, searchId, category,
 * sort, dir, page, perPage (ver listLeadsSchema). Paginação por página/página —
 * aguenta dezenas de milhares de linhas porque o SQLite só materializa a janela.
 */
export async function GET(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");

  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = listLeadsSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return apiError(422, "validation_error", `Filtro inválido: ${first?.path?.join(".") ?? "query"}`);
  }
  const input = parsed.data;

  try {
    const tdb = tenantDb(auth.payload.tid);
    const where = buildLeadWhere(input);
    const [total, leads, tempCounts, stageCounts] = await Promise.all([
      tdb.lead.count({ where }),
      tdb.lead.findMany({
        where,
        orderBy: [buildLeadOrder(input), { id: "asc" }],
        skip: (input.page - 1) * input.perPage,
        take: input.perPage,
        select: LEAD_LIST_SELECT,
      }),
      tdb.lead.groupBy({
        by: ["temperature"],
        where,
        _count: { _all: true },
      }),
      tdb.lead.groupBy({
        by: ["stage"],
        where,
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      leads: leads.map(leadListItem),
      pagination: {
        page: input.page,
        perPage: input.perPage,
        total,
        totalPages: Math.max(Math.ceil(total / input.perPage), 1),
      },
      aggregates: {
        byTemperature: Object.fromEntries(tempCounts.map((c) => [c.temperature, c._count._all])),
        byStage: Object.fromEntries(stageCounts.map((c) => [c.stage, c._count._all])),
      },
    });
  } catch (err) {
    return mapServiceError(err);
  }
}
