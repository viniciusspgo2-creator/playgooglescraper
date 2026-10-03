import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthContext } from "@/server/auth/guard";
import { mapServiceError, apiError } from "@/server/http";
import { tenantDb } from "@/server/tenancy/tenant-guard";

/**
 * GET /api/stats/overview — agregações do dashboard (Fase 5).
 * Tudo derivado de dados reais do tenant: totais, temperatura, etapas,
 * série diária 14d, categorias, telemetria de estratégia e buscas ativas.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");

  try {
    const tdb = tenantDb(auth.payload.tid);
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: auth.payload.tid },
      select: { leadCredits: true, leadCreditsUsed: true, plan: true },
    });

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const [totalLeads, byTemp, byStage, byStrategy, recentLeads, activeSearches, leads24h, members] =
      await Promise.all([
        tdb.lead.count(),
        tdb.lead.groupBy({ by: ["temperature"], _count: { _all: true } }),
        tdb.lead.groupBy({ by: ["stage"], _count: { _all: true } }),
        tdb.lead.groupBy({ by: ["sourceStrategy"], where: { sourceStrategy: { not: null } }, _count: { _all: true } }),
        tdb.lead.findMany({
          where: { createdAt: { gte: fourteenDaysAgo } },
          select: { createdAt: true },
        }),
        tdb.search.findMany({
          where: { status: { in: ["queued", "running", "paused"] } },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, term: true, status: true, cellsTotal: true, cellsDone: true, createdAt: true },
        }),
        tdb.lead.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
        tdb.user.count({ where: { status: "active" } }),
      ]);

    // Série diária (14 dias, incluindo dias vazios)
    const byDay: Array<{ date: string; count: number }> = [];
    const dayBuckets = new Map<string, number>();
    for (const lead of recentLeads) {
      const key = lead.createdAt.toISOString().slice(0, 10);
      dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + 1);
    }
    for (let i = 13; i >= 0; i -= 1) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      byDay.push({ date, count: dayBuckets.get(date) ?? 0 });
    }

    // Top categorias (primaryCategory)
    const topCategories = await tdb.lead.groupBy({
      by: ["primaryCategory"],
      where: { primaryCategory: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { primaryCategory: "desc" } },
      take: 6,
    });

    const activities = await tdb.activity.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, type: true, dataJson: true, userId: true, createdAt: true },
    });

    return NextResponse.json({
      ok: true,
      totals: {
        leads: totalLeads,
        leads24h,
        members,
        hot: byTemp.find((t) => t.temperature === "hot")?._count._all ?? 0,
        warm: byTemp.find((t) => t.temperature === "warm")?._count._all ?? 0,
        cold: byTemp.find((t) => t.temperature === "cold")?._count._all ?? 0,
      },
      byStage: Object.fromEntries(byStage.map((s) => [s.stage, s._count._all])),
      byStrategy: Object.fromEntries(byStrategy.map((s) => [s.sourceStrategy, s._count._all])),
      byDay,
      topCategories: topCategories.map((c) => ({ category: c.primaryCategory ?? "—", count: c._count._all })),
      activeSearches: activeSearches.map((s) => ({
        id: s.id,
        term: s.term,
        status: s.status,
        cellsTotal: s.cellsTotal,
        cellsDone: s.cellsDone,
        createdAt: s.createdAt.toISOString(),
      })),
      credits: {
        limit: tenant.leadCredits,
        used: tenant.leadCreditsUsed,
        remaining: Math.max(tenant.leadCredits - tenant.leadCreditsUsed, 0),
      },
      activities: activities.map((a) => ({
        id: a.id,
        type: a.type,
        data: a.dataJson ? (JSON.parse(a.dataJson) as unknown) : null,
        userId: a.userId,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return mapServiceError(err);
  }
}
