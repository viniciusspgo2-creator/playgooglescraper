/**
 * Billing (Fase 8) — catálogo de planos, checkout (Stripe/Mercado Pago quando
 * configurados) e aplicação idempotente de eventos de pagamento.
 * Sem credenciais, a UI mostra o estado real: provedor não configurado, com
 * ativação manual para vendas assistidas (nunca "compra simulada").
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { db } from "@/lib/db";
import { tenantDb } from "@/server/tenancy/tenant-guard";

export type PlanKey = "trial" | "starter" | "pro" | "business";

export type PlanDefinition = {
  key: PlanKey;
  credits: number;
  seats: number;
  priceMonthlyBRL: number;
  priceAnnualBRL: number;
};

/** Mesmos valores da landing page (fonte única visual; valores em centavos BRL). */
export const PLANS: Record<PlanKey, PlanDefinition> = {
  trial: { key: "trial", credits: 500, seats: 3, priceMonthlyBRL: 0, priceAnnualBRL: 0 },
  starter: { key: "starter", credits: 2000, seats: 1, priceMonthlyBRL: 9700, priceAnnualBRL: 7700 },
  pro: { key: "pro", credits: 8000, seats: 3, priceMonthlyBRL: 19700, priceAnnualBRL: 15700 },
  business: { key: "business", credits: 30000, seats: 10, priceMonthlyBRL: 49700, priceAnnualBRL: 39700 },
};

export function billingProviderStatus(): { stripe: boolean; mercadopago: boolean } {
  return {
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    mercadopago: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN),
  };
}

/** Aplica plano/créditos ao tenant (checkout concluído ou ativação manual). */
export async function applyPlanToTenant(
  tenantId: string,
  input: { plan: PlanKey; credits: number; seats: number; source: string; note?: string }
): Promise<void> {
  await db.tenant.update({
    where: { id: tenantId },
    data: { plan: input.plan, leadCredits: input.credits, seats: input.seats },
  });
  const tdb = tenantDb(tenantId);
  await tdb.activity.create({
    data: {
      tenantId,
      type: "billing.plan_applied",
      dataJson: JSON.stringify({ plan: input.plan, credits: input.credits, seats: input.seats, source: input.source, note: input.note ?? null }),
    },
  });
}

/** Webhook Stripe: valida assinatura (quando segredo presente) — HMAC sha256 de `t.payload`. */
export function verifyStripeSignature(payload: string, header: string | null, secret: string | undefined): { ok: boolean; reason?: string } {
  if (!secret) return { ok: true, reason: "no_secret_configured" }; // sandbox/dev: sem verificação possível
  if (!header) return { ok: false, reason: "missing_signature" };
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return { ok: false, reason: "malformed_signature" };
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return { ok: a.length === b.length && timingSafeEqual(a, b) };
}

/** Webhook Mercado Pago: x-signature "ts=...,v1=..." HMAC do manifest id. */
export function verifyMercadoPagoSignature(dataId: string, header: string | null, secret: string | undefined): { ok: boolean; reason?: string } {
  if (!secret) return { ok: true, reason: "no_secret_configured" };
  if (!header) return { ok: false, reason: "missing_signature" };
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return { ok: false, reason: "malformed_signature" };
  const expected = createHmac("sha256", secret).update(`id:${dataId};request-id:${parts["request-id"] ?? ""};ts:${ts};`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return { ok: a.length === b.length && timingSafeEqual(a, b) };
}

/** Cria sessão de checkout Stripe (REST, sem SDK) — retorna url real. */
export async function createStripeCheckout(input: {
  tenantId: string;
  plan: Exclude<PlanKey, "trial">;
  cycle: "monthly" | "annual";
  origin: string;
}): Promise<{ url: string } | { error: string }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { error: "stripe_unconfigured" };
  const plan = PLANS[input.plan];
  const amount = input.cycle === "monthly" ? plan.priceMonthlyBRL : plan.priceAnnualBRL;
  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": "brl",
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][price_data][product_data][name]": `Play Google Scraper — ${input.plan} (${input.cycle})`,
    "line_items[0][quantity]": "1",
    success_url: `${input.origin}/`,
    cancel_url: `${input.origin}/`,
    "metadata[tenantId]": input.tenantId,
    "metadata[plan]": input.plan,
    "metadata[cycle]": input.cycle,
    "metadata[credits]": String(plan.credits),
    "metadata[seats]": String(plan.seats),
  });
  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) return { error: `stripe_http_${res.status}` };
    const json = (await res.json()) as { url?: string };
    if (!json.url) return { error: "stripe_no_url" };
    return { url: json.url };
  } catch {
    return { error: "stripe_network_error" };
  }
}
