import { NextResponse } from "next/server";

import { requireSession } from "@/server/auth/guard";
import { updateProfile } from "@/server/auth/service";
import { mapServiceError, parseBody } from "@/server/http";
import { updateSessionSchema } from "@/shared/schemas";

export async function GET() {
  const { ctx, error } = await requireSession();
  if (error) return error;
  return NextResponse.json({ ok: true, session: ctx.session });
}

export async function PATCH(req: Request) {
  const { ctx, error } = await requireSession();
  if (error) return error;

  const { data, error: parseError } = await parseBody(req, updateSessionSchema);
  if (parseError) return parseError;

  try {
    const session = await updateProfile(ctx.session.user.id, {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.locale !== undefined ? { locale: data.locale } : {}),
    });
    if (!session) {
      return NextResponse.json({ ok: false, error: { code: "not_found", message: "Usuário não encontrado." } }, { status: 404 });
    }
    return NextResponse.json({ ok: true, session });
  } catch (err) {
    return mapServiceError(err);
  }
}
