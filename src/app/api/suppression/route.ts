import { NextResponse } from "next/server";

import { getAuthContext, forbidden } from "@/server/auth/guard";
import { mapServiceError, parseBody, apiError } from "@/server/http";
import { suppressionSchema } from "@/shared/schemas";
import { tenantDb } from "@/server/tenancy/tenant-guard";

/** GET /api/suppression — lista de supressão (LGPD, Fase 7). */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  try {
    const tdb = tenantDb(auth.payload.tid);
    const entries = await tdb.suppressionEntry.findMany({ orderBy: { createdAt: "desc" }, take: 1000 });
    return NextResponse.json({
      ok: true,
      entries: entries.map((e) => ({
        id: e.id,
        phoneE164: e.phoneE164,
        reason: e.reason,
        note: e.note,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** POST /api/suppression — adiciona telefone à lista (nunca mais recebe campanha). */
export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role === "member") return forbidden();
  const { data, error } = await parseBody(req, suppressionSchema);
  if (error) return error;
  try {
    const tdb = tenantDb(auth.payload.tid);
    const entry = await tdb.suppressionEntry.create({
      data: { tenantId: auth.payload.tid, phoneE164: data.phoneE164, reason: data.reason, note: data.note ?? null },
    });
    await tdb.activity.create({
      data: {
        tenantId: auth.payload.tid,
        userId: auth.payload.uid,
        type: "suppression.added",
        dataJson: JSON.stringify({ phoneE164: data.phoneE164, reason: data.reason }),
      },
    });
    return NextResponse.json({ ok: true, entry: { id: entry.id } });
  } catch (err) {
    return mapServiceError(err);
  }
}
