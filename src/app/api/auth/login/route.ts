import { NextResponse } from "next/server";

import { AuthError, login } from "@/server/auth/service";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/server/auth/session";
import { apiError, mapServiceError, parseBody } from "@/server/http";
import { rateLimit, requestIp } from "@/server/rate-limit";
import { db } from "@/lib/db";
import { loginSchema } from "@/shared/schemas";

export async function POST(req: Request) {
  const ip = requestIp(req);
  const { data, error } = await parseBody(req, loginSchema);
  if (error) return error;

  // Rate limit por IP+email (defesa contra força bruta).
  const rl = rateLimit(`login:${ip}:${data.email.toLowerCase()}`, 10, 15 * 60 * 1000);
  if (!rl.ok) {
    return apiError(429, "rate_limited", "Muitas tentativas de login. Aguarde alguns minutos.");
  }

  try {
    const session = await login(data);
    const user = await db.user.findUnique({
      where: { email: data.email.trim().toLowerCase() },
      select: { id: true, role: true, tokenVersion: true, tenantId: true },
    });
    if (!user) return apiError(500, "internal_error", "Erro interno.");

    const { token, expiresAt } = signSession({
      uid: user.id,
      tid: user.tenantId,
      role: user.role,
      ver: user.tokenVersion,
    });
    const res = NextResponse.json({ ok: true, session });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(Math.floor((expiresAt.getTime() - Date.now()) / 1000)));
    return res;
  } catch (err) {
    if (err instanceof AuthError && err.code === "invalid_credentials") {
      // Mensagem genérica — sem enumeração de contas.
      return apiError(401, "invalid_credentials", "E-mail ou senha inválidos.");
    }
    return mapServiceError(err);
  }
}
