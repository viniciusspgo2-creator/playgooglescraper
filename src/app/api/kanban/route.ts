import { NextResponse } from "next/server";

import { getAuthContext } from "@/server/auth/guard";
import { mapServiceError, apiError } from "@/server/http";
import { LEAD_LIST_SELECT, leadListItem } from "@/server/leads/query";
import { KANBAN_STAGES } from "@/shared/contracts";
import { tenantDb } from "@/server/tenancy/tenant-guard";

/**
 * GET /api/kanban — board do Kanban (Fase 6): colunas por etapa com
 * contagens globais + os primeiros 60 cards de cada etapa (ordem heat desc).
 * O drag-and-drop usa PATCH /api/leads/[id] (stage).
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");

  try {
    const tdb = tenantDb(auth.payload.tid);
    const [counts, ...columns] = await Promise.all([
      tdb.lead.groupBy({ by: ["stage"], _count: { _all: true } }),
      ...KANBAN_STAGES.map((stage) =>
        tdb.lead.findMany({
          where: { stage },
          orderBy: [{ heatScore: "desc" }, { updatedAt: "desc" }],
          take: 60,
          select: LEAD_LIST_SELECT,
        })
      ),
    ]);

    const countByStage = Object.fromEntries(counts.map((c) => [c.stage, c._count._all]));

    return NextResponse.json({
      ok: true,
      columns: KANBAN_STAGES.map((stage, index) => ({
        stage,
        total: countByStage[stage] ?? 0,
        leads: columns[index]!.map(leadListItem),
      })),
    });
  } catch (err) {
    return mapServiceError(err);
  }
}
