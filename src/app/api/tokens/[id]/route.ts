import { NextResponse } from "next/server";

import { requireRole, requireSession } from "@/server/auth/guard";
import { apiError, mapServiceError } from "@/server/http";
import { revokeApiToken } from "@/server/tokens/service";

/** Revoga um token (owner/admin). Tokens revogados falham imediatamente na extensão. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireSession();
  if (error) return error;

  const roleCheck = requireRole(ctx, ["owner", "admin"]);
  if (!roleCheck.ok) return roleCheck.error;

  const { id } = await params;
  if (!id) return apiError(422, "validation_error", "ID do token ausente.");

  try {
    const result = await revokeApiToken(ctx.session.tenant.id, ctx.session.user.id, id);
    if (!result.ok) {
      return apiError(404, "not_found", "Token não encontrado ou já revogado.");
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapServiceError(err);
  }
}
