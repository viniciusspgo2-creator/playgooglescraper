import { getAuthContext } from "@/server/auth/guard";
import { apiError, mapServiceError } from "@/server/http";
import { buildLeadWhere } from "@/server/leads/query";
import { listLeadsSchema } from "@/shared/schemas";
import { tenantDb } from "@/server/tenancy/tenant-guard";

/**
 * GET /api/leads/export — exportação CSV (LGPD: portabilidade; operação: planilha).
 * Mesmos filtros da listagem; BOM UTF-8 para Excel; limite de 100k linhas.
 */
export async function GET(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return apiError(401, "unauthorized", "Sessão inválida.");

  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = listLeadsSchema.safeParse({ ...raw, page: "1", perPage: "100" });
  if (!parsed.success) {
    return apiError(422, "validation_error", "Filtros inválidos para exportação.");
  }
  const perPage = 500;
  const input = { ...parsed.data, perPage, page: 1 };

  try {
    const tdb = tenantDb(auth.payload.tid);
    const where = buildLeadWhere(input);
    const header = [
      "name",
      "phone",
      "website",
      "website_type",
      "temperature",
      "heat_score",
      "stage",
      "email",
      "address",
      "lat",
      "lng",
      "rating",
      "reviews",
      "primary_category",
      "categories",
      "claimed",
      "place_id",
      "strategy",
      "created_at",
    ];

    function csvEscape(value: unknown): string {
      if (value === null || value === undefined) return "";
      const str = String(value);
      if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
      return str;
    }

    const lines: string[] = [header.join(",")];
    let page = 1;
    const MAX_ROWS = 100_000;
    let rows = 0;

    for (;;) {
      const batch = await tdb.lead.findMany({
        where,
        orderBy: [{ heatScore: "desc" }, { id: "asc" }],
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          name: true,
          phoneE164: true,
          website: true,
          websiteType: true,
          temperature: true,
          heatScore: true,
          stage: true,
          email: true,
          address: true,
          lat: true,
          lng: true,
          rating: true,
          reviewsCount: true,
          primaryCategory: true,
          categoriesText: true,
          claimed: true,
          placeId: true,
          sourceStrategy: true,
          createdAt: true,
        },
      });
      if (batch.length === 0) break;
      for (const l of batch) {
        lines.push(
          [
            l.name,
            l.phoneE164,
            l.website,
            l.websiteType,
            l.temperature,
            l.heatScore,
            l.stage,
            l.email,
            l.address,
            l.lat,
            l.lng,
            l.rating,
            l.reviewsCount,
            l.primaryCategory,
            l.categoriesText,
            l.claimed === null ? "" : l.claimed ? "true" : "false",
            l.placeId,
            l.sourceStrategy,
            l.createdAt.toISOString(),
          ]
            .map(csvEscape)
            .join(",")
        );
        rows += 1;
        if (rows >= MAX_ROWS) break;
      }
      if (batch.length < perPage || rows >= MAX_ROWS) break;
      page += 1;
    }

    const csv = "\uFEFF" + lines.join("\r\n");
    await tdb.activity.create({
      data: {
        tenantId: auth.payload.tid,
        userId: auth.payload.uid,
        type: "leads.exported",
        dataJson: JSON.stringify({ rows, filters: raw }),
      },
    });

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return mapServiceError(err);
  }
}
