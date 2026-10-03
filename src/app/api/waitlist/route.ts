import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit, requestIp } from "@/server/rate-limit";
import { locales } from "@/i18n/config";

/**
 * POST /api/waitlist — entrada real na lista de acesso antecipado (Fase 1).
 * Validação Zod na fronteira + rate limit por IP + upsert idempotente por e-mail.
 * (Fase 2+ substitui pelo onboarding de tenants; ver ADR-001.)
 */

const waitlistBodySchema = z.object({
  email: z.email().max(254),
  locale: z.enum(locales).default("pt-BR"),
  source: z.string().max(64).default("landing"),
});

export async function POST(req: Request) {
  // Rate limit: 5 envios/minuto por IP.
  const ip = requestIp(req);
  const rl = rateLimit(`waitlist:ip:${ip}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAtMs - Date.now()) / 1000)) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = waitlistBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const { email, locale, source } = parsed.data;

  try {
    await db.waitlistSignup.create({
      data: { email: email.toLowerCase(), locale, source },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    // E-mail duplicado → conflito explícito (o cliente mostra mensagem i18n).
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json({ ok: false, error: "duplicate_email" }, { status: 409 });
    }
    console.error("[waitlist] erro ao inserir:", err);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
