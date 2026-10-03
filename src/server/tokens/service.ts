/**
 * Tokens de API — conexão da extensão Chrome com o sistema (spec §Protocolo).
 * Formato: pgs_live_<slug>_<32 bytes em hex>. Só o SHA-256 é persistido;
 * o token bruto é mostrado UMA única vez na criação.
 */
import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { tenantDb } from "@/server/tenancy/tenant-guard";

export const TOKEN_SCOPES = ["verify", "leads:read", "leads:write"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

export class TokenError extends Error {
  constructor(
    public code: "not_found" | "revoked" | "tenant_not_found",
    message: string
  ) {
    super(message);
    this.name = "TokenError";
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function parseScopes(raw: string): TokenScope[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is TokenScope => (TOKEN_SCOPES as readonly string[]).includes(s as string));
  } catch {
    return [];
  }
}

export type GeneratedToken = {
  raw: string;
  hash: string;
  prefix: string;
};

export function generateRawToken(tenantSlug: string): GeneratedToken {
  const slugPart = tenantSlug.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase() || "tenant";
  const secretPart = randomBytes(32).toString("hex"); // 32 bytes aleatórios (spec)
  const raw = `pgs_live_${slugPart}_${secretPart}`;
  const prefix = `${raw.slice(0, 20)}…${raw.slice(-4)}`;
  return { raw, hash: sha256(raw), prefix };
}

export async function createApiToken(
  tenantId: string,
  input: { name: string; scopes: TokenScope[]; deviceLabel?: string; createdById: string }
): Promise<{ token: { id: string; name: string; prefix: string; scopes: TokenScope[] }; raw: string }> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  if (!tenant) throw new TokenError("tenant_not_found", "Organização não encontrada.");
  const generated = generateRawToken(tenant.slug);
  const tdb = tenantDb(tenantId);
  const token = await tdb.apiToken.create({
    data: {
      tenantId,
      name: input.name,
      tokenHash: generated.hash,
      tokenPrefix: generated.prefix,
      scopesJson: JSON.stringify(input.scopes),
      deviceLabel: input.deviceLabel ?? null,
      createdById: input.createdById,
    },
  });
  await tdb.activity.create({
    data: {
      tenantId,
      userId: input.createdById,
      type: "token.created",
      dataJson: JSON.stringify({ tokenId: token.id, scopes: input.scopes }),
    },
  });
  return {
    token: { id: token.id, name: token.name, prefix: token.tokenPrefix, scopes: input.scopes },
    raw: generated.raw,
  };
}

export async function listApiTokens(tenantId: string) {
  const tdb = tenantDb(tenantId);
  const tokens = await tdb.apiToken.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      scopesJson: true,
      deviceLabel: true,
      lastUsedAt: true,
      useCount: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return tokens.map((t) => ({
    id: t.id,
    name: t.name,
    prefix: t.tokenPrefix,
    scopes: parseScopes(t.scopesJson),
    deviceLabel: t.deviceLabel,
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    useCount: t.useCount,
    revokedAt: t.revokedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  }));
}

export async function revokeApiToken(
  tenantId: string,
  actorId: string,
  tokenId: string
): Promise<{ ok: true } | { ok: false }> {
  const tdb = tenantDb(tenantId);
  const token = await tdb.apiToken.findFirst({ where: { id: tokenId } });
  if (!token || token.revokedAt) return { ok: false };
  await tdb.apiToken.updateMany({
    where: { id: tokenId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await tdb.activity.create({
    data: { tenantId, userId: actorId, type: "token.revoked", dataJson: JSON.stringify({ tokenId }) },
  });
  return { ok: true };
}

export type AuthenticatedToken = {
  tokenId: string;
  tenantId: string;
  scopes: TokenScope[];
};

/** Autenticação por token bruto (rotas /api/v1/*). Toca métricas de uso. */
export async function authenticateApiToken(raw: string): Promise<AuthenticatedToken | null> {
  if (!raw.startsWith("pgs_live_")) return null;
  const hash = sha256(raw);
  const token = await db.apiToken.findUnique({ where: { tokenHash: hash } });
  if (!token || token.revokedAt) return null;

  // Métricas de uso (chave global única do hash — sem risco de cross-tenant).
  await db.apiToken.updateMany({
    where: { id: token.id },
    data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
  });

  return { tokenId: token.id, tenantId: token.tenantId, scopes: parseScopes(token.scopesJson) };
}

export function tokenHasScope(auth: AuthenticatedToken, scope: TokenScope): boolean {
  return auth.scopes.includes(scope);
}
