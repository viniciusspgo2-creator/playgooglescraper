import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { applyPlanToTenant, verifyMercadoPagoSignature, type PlanKey } from "@/server/billing/service";

/**
 * POST /api/webhooks/mercadopago — webhook idempotente (Fase 8).
 * external_reference esperado: "<tenantId>|<plan>|<credits>|<seats>".
 */
export async function POST(req: Request) {
  const payload = await req.text();
  let body: { data?: { id?: string }; type?: string; external_reference?: string };
  try {
    body = JSON.parse(payload) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: { code: "invalid_json" } }, { status: 400 });
  }

  const dataId = body.data?.id ?? `mp-${Date.now()}`;
  const verification = verifyMercadoPagoSignature(dataId, req.headers.get("x-signature"), process.env.MERCADOPAGO_WEBHOOK_SECRET);
  if (!verification.ok) {
    return NextResponse.json({ ok: false, error: { code: "invalid_signature", message: verification.reason } }, { status: 400 });
  }

  const type = body.type ?? "payment";
  const reference = body.external_reference ?? "";
  const [tenantId, plan, creditsRaw, seatsRaw] = reference.split("|");
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: { code: "missing_external_reference" } }, { status: 400 });
  }
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) {
    return NextResponse.json({ ok: false, error: { code: "tenant_not_found" } }, { status: 404 });
  }

  try {
    await db.billingEvent.create({
      data: {
        tenantId,
        provider: "mercado_pago",
        eventId: dataId,
        type,
        payloadJson: payload.slice(0, 20_000),
      },
    });
  } catch {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const credits = Number.parseInt(creditsRaw ?? "0", 10);
  if (credits > 0) {
    await applyPlanToTenant(tenantId, {
      plan: (plan ?? "pro") as PlanKey,
      credits,
      seats: Number.parseInt(seatsRaw ?? "1", 10) || 1,
      source: "mercado_pago",
      note: type,
    });
  }
  return NextResponse.json({ ok: true });
}
