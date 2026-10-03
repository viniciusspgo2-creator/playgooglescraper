import { NextResponse } from "next/server";

import { getAuthContext, forbidden } from "@/server/auth/guard";
import { mapServiceError, apiError } from "@/server/http";
import { dispatchPendingDeliveries } from "@/server/webhooks/service";

/**
 * POST /api/webhooks/dispatch — força reenvio das entregas pendentes/falhadas
 * do tenant (backoff persistido; útil após corrigir o endpoint de destino).
 */
export async function POST() {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role === "member") return forbidden();
  try {
    const delivered = await dispatchPendingDeliveries(auth.payload.tid);
    return NextResponse.json({ ok: true, delivered });
  } catch (err) {
    return mapServiceError(err);
  }
}
