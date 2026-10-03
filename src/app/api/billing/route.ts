import { NextResponse } from "next/server";

import { getAuthContext, forbidden } from "@/server/auth/guard";
import { mapServiceError, parseBody, apiError } from "@/server/http";
import { manualActivationSchema } from "@/shared/schemas";
import { tenantDb } from "@/server/tenancy/tenant-guard";
import { db } from "@/lib/db";
import { PLANS, applyPlanToTenant, billingProviderStatus, createStripeCheckout, type PlanKey } from "@/server/billing/service";
import { z } from "zod";

/** GET /api/billing — plano atual, catálogo, provedores configurados e eventos. */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  try {
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: auth.payload.tid },
      select: { plan: true, leadCredits: true, leadCreditsUsed: true, seats: true },
    });
    const tdb = tenantDb(auth.payload.tid);
    const events = await tdb.billingEvent.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    return NextResponse.json({
      ok: true,
      current: {
        plan: tenant.plan,
        leadCredits: tenant.leadCredits,
        leadCreditsUsed: tenant.leadCreditsUsed,
        seats: tenant.seats,
        remaining: Math.max(tenant.leadCredits - tenant.leadCreditsUsed, 0),
      },
      catalog: Object.values(PLANS),
      providers: billingProviderStatus(),
      events: events.map((e) => ({
        id: e.id,
        provider: e.provider,
        eventId: e.eventId,
        type: e.type,
        processedAt: e.processedAt.toISOString(),
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return mapServiceError(err);
  }
}

const checkoutSchema = z.object({
  plan: z.enum(["starter", "pro", "business"]),
  cycle: z.enum(["monthly", "annual"]).default("monthly"),
});

/** POST /api/billing — checkout real (Stripe configurado) ou estado honesto 409. */
export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role !== "owner" && auth.session.user.role !== "admin") {
    return forbidden("forbidden", "Apenas owner/admin podem contratar planos.");
  }
  const { data, error } = await parseBody(req, checkoutSchema);
  if (error) return error;

  const origin = req.headers.get("origin") ?? "http://localhost:3000";
  const checkout = await createStripeCheckout({
    tenantId: auth.payload.tid,
    plan: data.plan,
    cycle: data.cycle,
    origin,
  });

  if ("error" in checkout) {
    if (checkout.error === "stripe_unconfigured") {
      return apiError(
        409,
        "billing_provider_unconfigured",
        "Nenhum provedor de pagamento configurado (defina STRIPE_SECRET_KEY ou MERCADOPAGO_ACCESS_TOKEN). Use a ativação manual enquanto isso."
      );
    }
    return apiError(502, "billing_provider_error", `Falha no provedor de pagamento: ${checkout.error}`);
  }
  return NextResponse.json({ ok: true, checkoutUrl: checkout.url });
}

const activateSchema = manualActivationSchema.extend({});

/** PUT /api/billing — ativação manual (owner): vendas assistidas, sem provedor. */
export async function PUT(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role !== "owner") {
    return forbidden("forbidden", "Apenas o dono da organização pode ativar manualmente.");
  }
  const { data, error } = await parseBody(req, activateSchema);
  if (error) return error;

  try {
    await applyPlanToTenant(auth.payload.tid, {
      plan: data.plan as PlanKey,
      credits: data.credits,
      seats: data.seats,
      source: "manual_activation",
      note: data.note,
    });
    const tdb = tenantDb(auth.payload.tid);
    await tdb.billingEvent.create({
      data: {
        tenantId: auth.payload.tid,
        provider: "manual",
        eventId: `manual-${Date.now()}-${auth.payload.uid}`,
        type: "plan.activated",
        payloadJson: JSON.stringify({ plan: data.plan, credits: data.credits, seats: data.seats, note: data.note ?? null, by: auth.payload.uid }),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapServiceError(err);
  }
}
