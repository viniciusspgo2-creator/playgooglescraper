import { NextResponse } from "next/server";

import { requireRole, requireSession } from "@/server/auth/guard";
import { disableMember } from "@/server/auth/service";
import { apiError, mapServiceError } from "@/server/http";

/** Desativa um membro (owner/admin). Ninguém desativa owner nem a si mesmo. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireSession();
  if (error) return error;

  const roleCheck = requireRole(ctx, ["owner", "admin"]);
  if (!roleCheck.ok) return roleCheck.error;

  const { id } = await params;
  if (!id) return apiError(422, "validation_error", "ID do membro ausente.");

  try {
    await disableMember(ctx.session.tenant.id, ctx.session.user, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapServiceError(err);
  }
}
