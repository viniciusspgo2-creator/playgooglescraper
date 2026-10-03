import { NextResponse } from "next/server";

import { requireRole, requireSession } from "@/server/auth/guard";
import { AuthError, inviteMember, listMembers } from "@/server/auth/service";
import { apiError, mapServiceError, parseBody } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { inviteMemberSchema } from "@/shared/schemas";

export async function GET() {
  const { ctx, error } = await requireSession();
  if (error) return error;

  const members = await listMembers(ctx.session.tenant.id);
  return NextResponse.json({ ok: true, members, seats: ctx.session.tenant.seats });
}

export async function POST(req: Request) {
  const { ctx, error } = await requireSession();
  if (error) return error;

  const roleCheck = requireRole(ctx, ["owner", "admin"]);
  if (!roleCheck.ok) return roleCheck.error;

  const rl = rateLimit(`invite:${ctx.session.tenant.id}`, 10, 60 * 60 * 1000);
  if (!rl.ok) {
    return apiError(429, "rate_limited", "Muitos convites em pouco tempo.");
  }

  const { data, error: parseError } = await parseBody(req, inviteMemberSchema);
  if (parseError) return parseError;

  try {
    const result = await inviteMember(ctx.session.tenant.id, ctx.session.user, data);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError && err.code === "forbidden") {
      return apiError(403, "forbidden", err.message);
    }
    return mapServiceError(err);
  }
}
