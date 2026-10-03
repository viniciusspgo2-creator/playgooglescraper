import { NextResponse } from "next/server";

import { getAuthContext, forbidden } from "@/server/auth/guard";
import { mapServiceError, parseBody, apiError } from "@/server/http";
import { upsertTemplateSchema } from "@/shared/schemas";
import { tenantDb } from "@/server/tenancy/tenant-guard";
import { extractVariables } from "@/server/campaigns/service";

/** GET /api/templates — templates de mensagem do tenant (Fase 7). */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  try {
    const tdb = tenantDb(auth.payload.tid);
    const templates = await tdb.template.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({
      ok: true,
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        locale: t.locale,
        body: t.body,
        variables: t.variablesJson ? (JSON.parse(t.variablesJson) as string[]) : [],
        variations: t.variationsJson ? (JSON.parse(t.variationsJson) as string[]) : [],
        active: t.active,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** POST /api/templates — cria template (owner/admin). Variáveis validadas. */
export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");
  if (auth.session.user.role === "member") return forbidden();
  const { data, error } = await parseBody(req, upsertTemplateSchema);
  if (error) return error;

  const known = ["nome", "categoria", "cidade", "rating"];
  const used = extractVariables(data.body);
  const unknown = used.filter((v) => !known.includes(v));
  if (unknown.length > 0) {
    return apiError(422, "validation_error", `Variável não suportada: {{${unknown[0]}}}. Use ${known.map((k) => `{{${k}}}`).join(", ")}.`);
  }

  try {
    const tdb = tenantDb(auth.payload.tid);
    const template = await tdb.template.create({
      data: {
        tenantId: auth.payload.tid,
        name: data.name,
        locale: data.locale,
        body: data.body,
        variablesJson: JSON.stringify(used),
        variationsJson: JSON.stringify(data.variations),
        active: data.active,
      },
    });
    await tdb.activity.create({
      data: {
        tenantId: auth.payload.tid,
        userId: auth.payload.uid,
        type: "template.created",
        dataJson: JSON.stringify({ templateId: template.id, name: data.name }),
      },
    });
    return NextResponse.json({ ok: true, template: { id: template.id } });
  } catch (err) {
    return mapServiceError(err);
  }
}
