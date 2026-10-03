import { NextResponse } from "next/server";

import { getAuthContext } from "@/server/auth/guard";
import { mapServiceError, apiError } from "@/server/http";
import { tenantDb } from "@/server/tenancy/tenant-guard";

/** GET /api/activities — trilha de auditoria paginada (Fase 6/Fase 10). */
export async function GET(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");

  const url = new URL(req.url);
  const page = Math.max(Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1);
  const perPage = Math.min(Math.max(Number.parseInt(url.searchParams.get("perPage") ?? "30", 10) || 30, 10), 100);

  try {
    const tdb = tenantDb(auth.payload.tid);
    const [total, rows] = await Promise.all([
      tdb.activity.count(),
      tdb.activity.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    const userIds = [...new Set(rows.map((r) => r.userId).filter((v): v is string => Boolean(v)))];
    const users = await tdb.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userById = new Map(users.map((u) => [u.id, u.name]));
    const leadIds = [...new Set(rows.map((r) => r.leadId).filter((v): v is string => Boolean(v)))];
    const leads = leadIds.length > 0
      ? await tdb.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true } })
      : [];
    const leadById = new Map(leads.map((l) => [l.id, l.name]));

    return NextResponse.json({
      ok: true,
      activities: rows.map((r) => ({
        id: r.id,
        type: r.type,
        data: r.dataJson ? (JSON.parse(r.dataJson) as unknown) : null,
        userName: r.userId ? userById.get(r.userId) ?? null : null,
        leadName: r.leadId ? leadById.get(r.leadId) ?? null : null,
        createdAt: r.createdAt.toISOString(),
      })),
      pagination: { page, perPage, total, totalPages: Math.max(Math.ceil(total / perPage), 1) },
    });
  } catch (err) {
    return mapServiceError(err);
  }
}
