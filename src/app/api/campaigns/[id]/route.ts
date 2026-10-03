import { NextResponse } from "next/server";

import { getAuthContext, forbidden } from "@/server/auth/guard";
import { mapServiceError, parseBody, apiError } from "@/server/http";
import { updateCampaignSchema } from "@/shared/schemas";
import { tenantDb } from "@/server/tenancy/tenant-guard";
import { processCampaign, promoteFollowups } from "@/server/campaigns/service";

type Params = { params: Promise<{ id: string }> };

/** GET /api/campaigns/[id] — detalhe + fila (mensagens renderizadas auditáveis). */
export async function GET(_req: Request, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  const { id } = await params;
  try {
    const tdb = tenantDb(auth.payload.tid);
    const campaign = await tdb.campaign.findFirst({ where: { id }, include: { template: { select: { name: true, body: true } } } });
    if (!campaign) return apiError(404, "not_found", "Campanha não encontrada.");
    const [stats, sample] = await Promise.all([
      tdb.campaignLead.groupBy({ by: ["status"], where: { campaignId: campaign.id }, _count: { _all: true } }),
      tdb.campaignLead.findMany({
        where: { campaignId: campaign.id },
        orderBy: { updatedAt: "desc" },
        take: 10,
        include: { lead: { select: { name: true, phoneE164: true, temperature: true } } },
      }),
    ]);
    return NextResponse.json({
      ok: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        whatsappMode: campaign.whatsappMode,
        templateId: campaign.templateId,
        templateName: campaign.template?.name ?? null,
        minDelaySec: campaign.minDelaySec,
        maxDelaySec: campaign.maxDelaySec,
        dailyLimit: campaign.dailyLimit,
        startHour: campaign.startHour,
        endHour: campaign.endHour,
        warmupEnabled: campaign.warmupEnabled,
        scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
        startedAt: campaign.startedAt?.toISOString() ?? null,
        finishedAt: campaign.finishedAt?.toISOString() ?? null,
        lastError: campaign.lastError,
        createdAt: campaign.createdAt.toISOString(),
      },
      stats: Object.fromEntries(stats.map((s) => [s.status, s._count._all])),
      queue: sample.map((row) => ({
        id: row.id,
        status: row.status,
        leadName: row.lead.name,
        phone: row.lead.phoneE164,
        temperature: row.lead.temperature,
        messageText: row.messageText,
        sentAt: row.sentAt?.toISOString() ?? null,
        error: row.error,
      })),
    });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** PATCH /api/campaigns/[id] — inicia/pausa/cancela ou ajusta parâmetros (owner/admin). */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role === "member") return forbidden();
  const { id } = await params;
  const { data, error } = await parseBody(req, updateCampaignSchema);
  if (error) return error;
  try {
    const tdb = tenantDb(auth.payload.tid);
    const campaign = await tdb.campaign.findFirst({ where: { id }, select: { id: true, status: true, startedAt: true } });
    if (!campaign) return apiError(404, "not_found", "Campanha não encontrada.");

    await tdb.campaign.updateMany({
      where: { id: campaign.id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.status === "running" && !campaign.startedAt ? { startedAt: new Date() } : {}),
        ...(data.minDelaySec !== undefined ? { minDelaySec: data.minDelaySec } : {}),
        ...(data.maxDelaySec !== undefined ? { maxDelaySec: data.maxDelaySec } : {}),
        ...(data.dailyLimit !== undefined ? { dailyLimit: data.dailyLimit } : {}),
        ...(data.startHour !== undefined ? { startHour: data.startHour } : {}),
        ...(data.endHour !== undefined ? { endHour: data.endHour } : {}),
      },
    });
    if (data.status !== undefined) {
      await tdb.activity.create({
        data: {
          tenantId: auth.payload.tid,
          userId: auth.payload.uid,
          type: "campaign.status_changed",
          dataJson: JSON.stringify({ campaignId: campaign.id, from: campaign.status, to: data.status }),
        },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** POST /api/campaigns/[id] — processa um tick da fila (follow-ups + envios). */
export async function POST(_req: Request, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role === "member") return forbidden();
  const { id } = await params;
  try {
    const tdb = tenantDb(auth.payload.tid);
    const campaign = await tdb.campaign.findFirst({ where: { id }, select: { id: true } });
    if (!campaign) return apiError(404, "not_found", "Campanha não encontrada.");
    await promoteFollowups(auth.payload.tid);
    const result = await processCampaign(auth.payload.tid, campaign.id);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** DELETE /api/campaigns/[id] — remove campanha e sua fila. */
export async function DELETE(_req: Request, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role === "member") return forbidden();
  const { id } = await params;
  try {
    const tdb = tenantDb(auth.payload.tid);
    const campaign = await tdb.campaign.findFirst({ where: { id }, select: { id: true } });
    if (!campaign) return apiError(404, "not_found", "Campanha não encontrada.");
    await tdb.campaign.deleteMany({ where: { id: campaign.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapServiceError(err);
  }
}
