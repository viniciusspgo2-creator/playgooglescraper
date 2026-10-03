import { NextResponse } from "next/server";

import { getAuthContext, forbidden } from "@/server/auth/guard";
import { mapServiceError, parseBody, apiError } from "@/server/http";
import { upsertTemplateSchema } from "@/shared/schemas";
import { tenantDb } from "@/server/tenancy/tenant-guard";
import { extractVariables } from "@/server/campaigns/service";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/templates/[id] — edita template (owner/admin). */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role === "member") return forbidden();
  const { id } = await params;
  const { data, error } = await parseBody(req, upsertTemplateSchema);
  if (error) return error;

  const known = ["nome", "categoria", "cidade", "rating"];
  const used = extractVariables(data.body);
  const unknown = used.filter((v) => !known.includes(v));
  if (unknown.length > 0) {
    return apiError(422, "validation_error", `Variável não suportada: {{${unknown[0]}}}.`);
  }

  try {
    const tdb = tenantDb(auth.payload.tid);
    const template = await tdb.template.findFirst({ where: { id }, select: { id: true } });
    if (!template) return apiError(404, "not_found", "Template não encontrado.");
    await tdb.template.updateMany({
      where: { id: template.id },
      data: {
        name: data.name,
        locale: data.locale,
        body: data.body,
        variablesJson: JSON.stringify(used),
        variationsJson: JSON.stringify(data.variations),
        active: data.active,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** DELETE /api/templates/[id] — remove template (campanhas mantêm o histórico). */
export async function DELETE(_req: Request, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role === "member") return forbidden();
  const { id } = await params;
  try {
    const tdb = tenantDb(auth.payload.tid);
    const template = await tdb.template.findFirst({ where: { id }, select: { id: true } });
    if (!template) return apiError(404, "not_found", "Template não encontrado.");
    await tdb.template.deleteMany({ where: { id: template.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapServiceError(err);
  }
}
