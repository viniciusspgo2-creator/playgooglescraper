import { NextResponse } from "next/server";

import { acceptInvite } from "@/server/auth/service";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/server/auth/session";
import { apiError, mapServiceError, parseBody } from "@/server/http";
import { rateLimit, requestIp } from "@/server/rate-limit";
import { db } from "@/lib/db";
import { acceptInviteSchema } from "@/shared/schemas";

export async function POST(req: Request) {
  const ip = requestIp(req);
  const rl = rateLimit(`accept-invite:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.ok) {
    return apiError(429, "rate_limited", "Muitas tentativas. Tente novamente mais tarde.");
  }

  const { data, error } = await parseBody(req, acceptInviteSchema);
  if (error) return error;

  try {
    const session = await acceptInvite(data);
    const user = await db.user.findUnique({
      where: { id: session.user.id },
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
    return mapServiceError(err);
  }
}
