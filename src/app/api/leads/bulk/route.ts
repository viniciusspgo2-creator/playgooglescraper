import { NextResponse } from "next/server";

import { getAuthContext } from "@/server/auth/guard";
import { mapServiceError, parseBody, apiError } from "@/server/http";
import { bulkLeadSchema } from "@/shared/schemas";
import { tenantDb } from "@/server/tenancy/tenant-guard";
import { enqueueDeliveries } from "@/server/webhooks/service";

/** PATCH /api/leads/bulk — muda a etapa de até 500 leads de uma vez (Kanban/planilha). */
export async function PATCH(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  const { data, error } = await parseBody(req, bulkLeadSchema);
  if (error) return error;

  try {
    const tdb = tenantDb(auth.payload.tid);
    const leads = await tdb.lead.findMany({
      where: { id: { in: data.ids } },
      select: { id: true, stage: true, name: true },
    });
    if (leads.length === 0) return apiError(404, "not_found", "Nenhum lead encontrado.");

    const changed = leads.filter((l) => l.stage !== data.stage);
    const res = await tdb.lead.updateMany({
      where: { id: { in: leads.map((l) => l.id) } },
      data: { stage: data.stage },
    });

    if (changed.length > 0) {
      await tdb.activity.createMany({
        data: changed.map((l) => ({
          tenantId: auth.payload.tid,
          userId: auth.payload.uid,
          leadId: l.id,
          type: "lead.stage_changed",
          dataJson: JSON.stringify({ from: l.stage, to: data.stage, name: l.name, bulk: true }),
        })),
      });
      // Webhook agregado por lote (evita rajada de entregas).
      await enqueueDeliveries(auth.payload.tid, [
        {
          event: "lead.stage_changed",
          payload: { bulk: true, to: data.stage, count: changed.length, leadIds: changed.slice(0, 50).map((l) => l.id) },
        },
      ]);
    }

    return NextResponse.json({ ok: true, updated: res.count });
  } catch (err) {
    return mapServiceError(err);
  }
}
