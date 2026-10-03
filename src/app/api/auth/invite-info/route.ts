import { NextResponse } from "next/server";

import { getInvitePreview } from "@/server/auth/service";
import { apiError } from "@/server/http";
import { rateLimit, requestIp } from "@/server/rate-limit";

/** Prévia de convite (?invite=…) — sem vazar dados além de e-mail/nome da org. */
export async function GET(req: Request) {
  const ip = requestIp(req);
  const rl = rateLimit(`invite-info:${ip}`, 30, 60 * 1000);
  if (!rl.ok) {
    return apiError(429, "rate_limited", "Muitas tentativas. Tente novamente mais tarde.");
  }

  const token = new URL(req.url).searchParams.get("token");
  if (!token || token.length < 16) {
    return apiError(422, "validation_error", "Token de convite ausente ou inválido.");
  }

  const preview = await getInvitePreview(token);
  if (!preview) {
    return apiError(410, "invite_invalid", "Convite inválido ou expirado.");
  }
  return NextResponse.json({ ok: true, invite: preview });
}
