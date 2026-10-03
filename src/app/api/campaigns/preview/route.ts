import { NextResponse } from "next/server";

import { getAuthContext, forbidden } from "@/server/auth/guard";
import { mapServiceError, parseBody, apiError } from "@/server/http";
import { createCampaignSchema } from "@/shared/schemas";
import { tenantDb } from "@/server/tenancy/tenant-guard";

/**
 * POST /api/campaigns/preview — conta a audiência SEM criar campanha.
 * Usado pelo dialog de criação para mostrar quantos leads receberão a mensagem.
 */
export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role === "member") return forbidden();

  const bodySchema = createCampaignSchema.pick({ audience: true });
  const { data, error } = await parseBody(req, bodySchema);
  if (error) return error;

  try {
    const tdb = tenantDb(auth.payload.tid);
    const suppressed = await tdb.suppressionEntry.findMany({ select: { phoneE164: true } });
    const suppressedSet = new Set(suppressed.map((s) => s.phoneE164));
    const audienceWhere = {
      ...(data.audience.stage !== "all" ? { stage: data.audience.stage } : {}),
      ...(data.audience.temperature !== "all" ? { temperature: data.audience.temperature } : {}),
      ...(data.audience.searchId ? { searchId: data.audience.searchId } : {}),
      ...(data.audience.minHeat !== undefined ? { heatScore: { gte: data.audience.minHeat } } : {}),
      ...(data.audience.onlyWithPhone ? { phoneE164: { not: null } } : {}),
    };
    const audience = await tdb.lead.findMany({ where: audienceWhere, select: { id: true, phoneE164: true } });
    const eligible = audience.filter((l) => !l.phoneE164 || !suppressedSet.has(l.phoneE164));
    return NextResponse.json({ ok: true, total: audience.length, eligible: eligible.length, suppressed: audience.length - eligible.length });
  } catch (err) {
    return mapServiceError(err);
  }
}
