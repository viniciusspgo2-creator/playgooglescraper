import { NextResponse } from "next/server";

import { getAuthContext, forbidden } from "@/server/auth/guard";
import { mapServiceError, parseBody, apiError } from "@/server/http";
import { updateLeadSchema } from "@/shared/schemas";
import { tenantDb } from "@/server/tenancy/tenant-guard";
import { enqueueDeliveries } from "@/server/webhooks/service";

type Params = { params: Promise<{ id: string }> };

/** GET /api/leads/[id] — detalhe completo (drawer do painel). */
export async function GET(_req: Request, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  const { id } = await params;
  try {
    const tdb = tenantDb(auth.payload.tid);
    const lead = await tdb.lead.findFirst({ where: { id } });
    if (!lead) return apiError(404, "not_found", "Lead não encontrado.");
    const search = lead.searchId
      ? await tdb.search.findFirst({ where: { id: lead.searchId }, select: { id: true, term: true } })
      : null;
    return NextResponse.json({
      ok: true,
      lead: {
        ...lead,
        sources: lead.sourcesJson ? (JSON.parse(lead.sourcesJson) as unknown) : null,
        categories: lead.categoriesJson ? (JSON.parse(lead.categoriesJson) as string[]) : [],
        hours: lead.hoursJson ? (JSON.parse(lead.hoursJson) as unknown) : null,
        sourcesJson: undefined,
        categoriesJson: undefined,
        hoursJson: undefined,
        searchTerm: search?.term ?? null,
        createdAt: lead.createdAt.toISOString(),
        updatedAt: lead.updatedAt.toISOString(),
        firstSeenAt: lead.firstSeenAt.toISOString(),
        lastSeenAt: lead.lastSeenAt.toISOString(),
      },
    });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** PATCH /api/leads/[id] — etapa (Kanban), e-mail e nota. Member pode trabalhar o funil. */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  const { id } = await params;
  const { data, error } = await parseBody(req, updateLeadSchema);
  if (error) return error;
  if (data.stage === undefined && data.email === undefined && data.note === undefined) {
    return apiError(422, "validation_error", "Informe stage, email ou note.");
  }
  try {
    const tdb = tenantDb(auth.payload.tid);
    const lead = await tdb.lead.findFirst({
      where: { id },
      select: { id: true, stage: true, name: true, placeId: true, temperature: true, heatScore: true, websiteType: true },
    });
    if (!lead) return apiError(404, "not_found", "Lead não encontrado.");

    await tdb.lead.updateMany({
      where: { id: lead.id },
      data: {
        ...(data.stage !== undefined ? { stage: data.stage } : {}),
        ...(data.email !== undefined ? { email: data.email === "" ? null : data.email, emailSource: data.email === "" ? null : "manual" } : {}),
        ...(data.note !== undefined ? { note: data.note } : {}),
      },
    });

    if (data.stage !== undefined && data.stage !== lead.stage) {
      await tdb.activity.create({
        data: {
          tenantId: auth.payload.tid,
          userId: auth.payload.uid,
          leadId: lead.id,
          type: "lead.stage_changed",
          dataJson: JSON.stringify({ from: lead.stage, to: data.stage, name: lead.name }),
        },
      });
      await enqueueDeliveries(auth.payload.tid, [
        {
          event: "lead.stage_changed",
          payload: { leadId: lead.id, name: lead.name, from: lead.stage, to: data.stage },
        },
      ]);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** DELETE /api/leads/[id] — direito de exclusão (LGPD). Owner/admin apenas. */
export async function DELETE(_req: Request, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role === "member") {
    return forbidden("forbidden", "Apenas owner/admin podem excluir leads.");
  }
  const { id } = await params;
  try {
    const tdb = tenantDb(auth.payload.tid);
    const lead = await tdb.lead.findFirst({ where: { id }, select: { id: true, placeId: true } });
    if (!lead) return apiError(404, "not_found", "Lead não encontrado.");
    await tdb.lead.deleteMany({ where: { id: lead.id } });
    await tdb.activity.create({
      data: {
        tenantId: auth.payload.tid,
        userId: auth.payload.uid,
        type: "lead.deleted",
        dataJson: JSON.stringify({ leadId: lead.id, placeId: lead.placeId }),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapServiceError(err);
  }
}
