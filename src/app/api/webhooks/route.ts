import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { getAuthContext, forbidden } from "@/server/auth/guard";
import { mapServiceError, parseBody, apiError } from "@/server/http";
import { webhookInSchema } from "@/shared/schemas";
import { tenantDb } from "@/server/tenancy/tenant-guard";

/** GET /api/webhooks — webhooks do tenant + estatística de entregas (Fase 8). */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  try {
    const tdb = tenantDb(auth.payload.tid);
    const hooks = await tdb.webhook.findMany({ orderBy: { createdAt: "desc" } });
    const deliveries = await tdb.webhookDelivery.groupBy({
      by: ["webhookId", "status"],
      _count: { _all: true },
    });
    const byHook = new Map<string, Record<string, number>>();
    for (const d of deliveries) {
      const map = byHook.get(d.webhookId) ?? {};
      map[d.status] = d._count._all;
      byHook.set(d.webhookId, map);
    }
    return NextResponse.json({
      ok: true,
      webhooks: hooks.map((h) => ({
        id: h.id,
        url: h.url,
        events: h.eventsJson ? (JSON.parse(h.eventsJson) as string[]) : [],
        active: h.active,
        deliveries: byHook.get(h.id) ?? {},
        createdAt: h.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** POST /api/webhooks — registra webhook (owner/admin); segredo HMAC exibido 1×. */
export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role === "member") return forbidden();
  const { data, error } = await parseBody(req, webhookInSchema);
  if (error) return error;
  try {
    const tdb = tenantDb(auth.payload.tid);
    const secret = randomBytes(24).toString("hex");
    const hook = await tdb.webhook.create({
      data: {
        tenantId: auth.payload.tid,
        url: data.url,
        secret,
        eventsJson: JSON.stringify(data.events),
      },
    });
    await tdb.activity.create({
      data: {
        tenantId: auth.payload.tid,
        userId: auth.payload.uid,
        type: "webhook.created",
        dataJson: JSON.stringify({ webhookId: hook.id, events: data.events }),
      },
    });
    // O segredo é exibido UMA vez (mesma política do token de API).
    return NextResponse.json({ ok: true, webhook: { id: hook.id }, secret });
  } catch (err) {
    return mapServiceError(err);
  }
}
