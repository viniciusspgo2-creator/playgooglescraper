import { NextResponse } from "next/server";

import { getAuthContext, forbidden } from "@/server/auth/guard";
import { mapServiceError, parseBody, apiError } from "@/server/http";
import { createCampaignSchema } from "@/shared/schemas";
import { tenantDb } from "@/server/tenancy/tenant-guard";
import { db } from "@/lib/db";

/** GET /api/campaigns — lista campanhas com estatísticas da fila (Fase 7). */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  try {
    const tdb = tenantDb(auth.payload.tid);
    const campaigns = await tdb.campaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { template: { select: { name: true } } },
    });
    const ids = campaigns.map((c) => c.id);
    const stats = ids.length > 0
      ? await tdb.campaignLead.groupBy({
          by: ["campaignId", "status"],
          where: { campaignId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    const statsByCampaign = new Map<string, Record<string, number>>();
    for (const s of stats) {
      const map = statsByCampaign.get(s.campaignId) ?? {};
      map[s.status] = s._count._all;
      statsByCampaign.set(s.campaignId, map);
    }
    return NextResponse.json({
      ok: true,
      campaigns: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        whatsappMode: c.whatsappMode,
        templateName: c.template?.name ?? "—",
        minDelaySec: c.minDelaySec,
        maxDelaySec: c.maxDelaySec,
        dailyLimit: c.dailyLimit,
        startHour: c.startHour,
        endHour: c.endHour,
        warmupEnabled: c.warmupEnabled,
        scheduledAt: c.scheduledAt?.toISOString() ?? null,
        startedAt: c.startedAt?.toISOString() ?? null,
        finishedAt: c.finishedAt?.toISOString() ?? null,
        lastError: c.lastError,
        createdAt: c.createdAt.toISOString(),
        stats: statsByCampaign.get(c.id) ?? {},
      })),
    });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** POST /api/campaigns — cria campanha e enfileira a audiência (owner/admin). */
export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role === "member") return forbidden();
  const { data, error } = await parseBody(req, createCampaignSchema);
  if (error) return error;

  try {
    const tdb = tenantDb(auth.payload.tid);
    const template = await tdb.template.findFirst({ where: { id: data.templateId }, select: { id: true, active: true } });
    if (!template) return apiError(404, "not_found", "Template não encontrado.");
    if (!template.active) return apiError(422, "validation_error", "Template inativo.");

    // Audiência real (com telefone válido) fora da lista de supressão
    const suppressed = await tdb.suppressionEntry.findMany({ select: { phoneE164: true } });
    const suppressedSet = new Set(suppressed.map((s) => s.phoneE164));

    const audienceWhere = {
      ...(data.audience.stage !== "all" ? { stage: data.audience.stage } : {}),
      ...(data.audience.temperature !== "all" ? { temperature: data.audience.temperature } : {}),
      ...(data.audience.searchId ? { searchId: data.audience.searchId } : {}),
      ...(data.audience.minHeat !== undefined ? { heatScore: { gte: data.audience.minHeat } } : {}),
      ...(data.audience.onlyWithPhone ? { phoneE164: { not: null } } : {}),
    };
    const audience = await tdb.lead.findMany({ where: audienceWhere, select: { id: true, phoneE164: true } });
    const eligible = audience.filter((l) => !l.phoneE164 || !suppressedSet.has(l.phoneE164));

    const campaign = await tdb.campaign.create({
      data: {
        tenantId: auth.payload.tid,
        name: data.name,
        templateId: data.templateId,
        whatsappMode: data.whatsappMode,
        minDelaySec: data.minDelaySec,
        maxDelaySec: data.maxDelaySec,
        dailyLimit: data.dailyLimit,
        startHour: data.startHour,
        endHour: data.endHour,
        warmupEnabled: data.warmupEnabled,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        status: data.scheduledAt ? "scheduled" : "draft",
      },
    });

    if (eligible.length > 0) {
      await tdb.campaignLead.createMany({
        data: eligible.map((l) => ({ tenantId: auth.payload.tid, campaignId: campaign.id, leadId: l.id })),
      });
    }

    await tdb.activity.create({
      data: {
        tenantId: auth.payload.tid,
        userId: auth.payload.uid,
        type: "campaign.created",
        dataJson: JSON.stringify({ campaignId: campaign.id, name: data.name, audience: eligible.length }),
      },
    });

    return NextResponse.json({ ok: true, campaign: { id: campaign.id }, queued: eligible.length });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** Referência viva para tipos. */
void db;
