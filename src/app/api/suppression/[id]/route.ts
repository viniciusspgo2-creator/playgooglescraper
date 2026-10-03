import { NextResponse } from "next/server";

import { getAuthContext, forbidden } from "@/server/auth/guard";
import { mapServiceError, apiError } from "@/server/http";
import { tenantDb } from "@/server/tenancy/tenant-guard";

type Params = { params: Promise<{ id: string }> };

/** DELETE /api/suppression/[id] — remove da lista (owner/admin; LGPD auditado). */
export async function DELETE(_req: Request, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role === "member") return forbidden();
  const { id } = await params;
  try {
    const tdb = tenantDb(auth.payload.tid);
    const entry = await tdb.suppressionEntry.findFirst({ where: { id }, select: { id: true, phoneE164: true } });
    if (!entry) return apiError(404, "not_found", "Registro não encontrado.");
    await tdb.suppressionEntry.deleteMany({ where: { id: entry.id } });
    await tdb.activity.create({
      data: {
        tenantId: auth.payload.tid,
        userId: auth.payload.uid,
        type: "suppression.removed",
        dataJson: JSON.stringify({ phoneE164: entry.phoneE164 }),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapServiceError(err);
  }
}
