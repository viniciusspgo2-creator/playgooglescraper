import { NextResponse } from "next/server";

import { requireRole, requireSession } from "@/server/auth/guard";
import { apiError, mapServiceError, parseBody } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { createApiToken, listApiTokens } from "@/server/tokens/service";
import { createTokenSchema } from "@/shared/schemas";

export async function GET() {
  const { ctx, error } = await requireSession();
  if (error) return error;

  const tokens = await listApiTokens(ctx.session.tenant.id);
  return NextResponse.json({ ok: true, tokens });
}

export async function POST(req: Request) {
  const { ctx, error } = await requireSession();
  if (error) return error;

  // Tokens concedem acesso a dados do tenant — apenas owner/admin criam.
  const roleCheck = requireRole(ctx, ["owner", "admin"]);
  if (!roleCheck.ok) return roleCheck.error;

  const rl = rateLimit(`token-create:${ctx.session.tenant.id}`, 20, 60 * 60 * 1000);
  if (!rl.ok) {
    return apiError(429, "rate_limited", "Muitos tokens criados em pouco tempo.");
  }

  const { data, error: parseError } = await parseBody(req, createTokenSchema);
  if (parseError) return parseError;

  try {
    const result = await createApiToken(ctx.session.tenant.id, {
      name: data.name,
      scopes: data.scopes,
      deviceLabel: data.deviceLabel,
      createdById: ctx.session.user.id,
    });
    // O token bruto volta EXATAMENTE uma vez nesta resposta.
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    return mapServiceError(err);
  }
}
