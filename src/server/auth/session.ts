/**
 * Sessão — cookie HttpOnly assinado com HMAC-SHA256 (ADR-003 §D2).
 * Payload: {uid, tid, role, ver, exp} — `ver` = users.tokenVersion.
 * `AUTH_SECRET` (≥32 chars) é obrigatório em produção; o fallback determinístico
 * abaixo existe APENAS para o sandbox e está documentado no README da fase.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "pgs_session";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 7; // 7 dias

export type SessionPayload = {
  uid: string;
  tid: string;
  role: string;
  ver: number;
  exp: number;
};

export type SessionIssueInput = {
  uid: string;
  tid: string;
  role: string;
  ver: number;
};

function authSecret(): string {
  const envSecret = process.env.AUTH_SECRET;
  if (envSecret && envSecret.length >= 32) return envSecret;
  // Fallback determinístico do sandbox (documentado em docs/phases/FASE-2.md).
  // Em produção: defina AUTH_SECRET — o boot loga aviso explícito.
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[auth] AUTH_SECRET ausente ou curto — usando fallback determinístico. DEFINA AUTH_SECRET EM PRODUÇÃO."
    );
  }
  return createHmac("sha256", "pgs-sandbox-fallback")
    .update(`pgs:${process.env.DATABASE_URL ?? "local"}`)
    .digest("hex");
}

function signBody(body: string): string {
  return createHmac("sha256", authSecret()).update(body).digest("base64url");
}

export function signSession(input: SessionIssueInput): { token: string; expiresAt: Date } {
  const payload: SessionPayload = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_S,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${body}.${signBody(body)}`, expiresAt: new Date(payload.exp * 1000) };
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = signBody(body);
  const macBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(expected);
  if (macBuf.length !== expectedBuf.length || !timingSafeEqual(macBuf, expectedBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.uid || !payload.tid) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeS: number = SESSION_MAX_AGE_S) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeS,
  };
}
