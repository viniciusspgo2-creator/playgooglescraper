import { NextResponse } from "next/server";

import { AuthError, registerTenantAndOwner } from "@/server/auth/service";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/server/auth/session";
import { apiError, mapServiceError, parseBody } from "@/server/http";
import { rateLimit, requestIp } from "@/server/rate-limit";
import { db } from "@/lib/db";
import { registerSchema } from "@/shared/schemas";

export async function POST(req: Request) {
  const ip = requestIp(req);
  const rl = rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.ok) {
    return apiError(429, "rate_limited", "Muitas tentativas. Tente novamente mais tarde.");
  }

  const { data, error } = await parseBody(req, registerSchema);
  if (error) return error;

  try {
    const session = await registerTenantAndOwner(data);
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
    const res = NextResponse.json({ ok: true, session }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(Math.floor((expiresAt.getTime() - Date.now()) / 1000)));
    return res;
  } catch (err) {
    if (err instanceof AuthError && err.code === "email_taken") {
      return apiError(409, "email_taken", "E-mail já cadastrado. Faça login.");
    }
    return mapServiceError(err);
  }
}
