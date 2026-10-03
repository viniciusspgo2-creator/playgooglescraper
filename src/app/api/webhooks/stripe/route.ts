import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { applyPlanToTenant, verifyStripeSignature, type PlanKey } from "@/server/billing/service";

/**
 * POST /api/webhooks/stripe — webhook idempotente (Fase 8).
 * Idempotência: BillingEvent @@unique([provider, eventId]) — reentrega é
 * registrada mas não reaplica plano/créditos.
 */
export async function POST(req: Request) {
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");
  const verification = verifyStripeSignature(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
  if (!verification.ok) {
    return NextResponse.json({ ok: false, error: { code: "invalid_signature", message: verification.reason } }, { status: 400 });
  }

  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(payload) as typeof event;
  } catch {
    return NextResponse.json({ ok: false, error: { code: "invalid_json" } }, { status: 400 });
  }

  const eventId = event.id;
  const type = event.type;
  if (!eventId || !type) {
    return NextResponse.json({ ok: false, error: { code: "invalid_event" } }, { status: 400 });
  }

  const relevant = ["checkout.session.completed", "invoice.paid", "payment_intent.succeeded"];
  if (!relevant.includes(type)) {
    return NextResponse.json({ ok: true, ignored: type });
  }

  const object = event.data?.object ?? {};
  const metadata = (object.metadata ?? {}) as Record<string, string>;
  const tenantId = metadata.tenantId;
  const plan = (metadata.plan ?? "pro") as PlanKey;
  const credits = Number.parseInt(metadata.credits ?? "0", 10);
  const seats = Number.parseInt(metadata.seats ?? "1", 10);

  if (!tenantId) {
    return NextResponse.json({ ok: false, error: { code: "missing_tenant_metadata" } }, { status: 400 });
  }

  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) {
    return NextResponse.json({ ok: false, error: { code: "tenant_not_found" } }, { status: 404 });
  }

  try {
    await db.billingEvent.create({
      data: {
        tenantId,
        provider: "stripe",
        eventId,
        type,
        payloadJson: payload.slice(0, 20_000),
      },
    });
  } catch {
    // unique violation → evento já processado (idempotência)
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (credits > 0) {
    await applyPlanToTenant(tenantId, { plan, credits, seats: seats || 1, source: "stripe", note: type });
  }
  return NextResponse.json({ ok: true });
}
