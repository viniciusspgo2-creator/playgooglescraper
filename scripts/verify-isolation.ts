/**
 * Auditoria de isolamento multi-tenant — critério de aceite da Fase 2.
 *
 * Executa:  bun run verify:isolation   (ou: bun scripts/verify-isolation.ts)
 *
 * Para CADA uma das 13 tabelas tenant-scoped, cria linhas em dois tenants
 * efêmeros (A e B) e prova:
 *   1) leitura cruzada  → 0 linhas (tenant B não lê dados do tenant A)
 *   2) escrita cruzada  → 0 linhas afetadas
 *   3) create com tenantId de outro tenant → TenantScopeError
 *   4) findUnique (operação proibida pelo guard) → TenantScopeError
 * Além disso: (tenant_id, place_id) aceita o mesmo place_id em tenants distintos.
 *
 * Qualquer falha → exit 1 (a fase é reprovada). Tenants de auditoria são
 * removidos ao final (cascade).
 */
import { Prisma } from "@prisma/client";

import { db } from "../src/lib/db";
import { TenantScopeError, tenantDb, type TenantClient } from "../src/server/tenancy/tenant-guard";

type Check = { name: string; pass: boolean; detail?: string };
type TableReport = { table: string; checks: Check[] };

const SUFFIX = Date.now().toString(36);
const SLUG_A = `audit-a-${SUFFIX}`;
const SLUG_B = `audit-b-${SUFFIX}`;

async function expectTenantScopeError(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (err) {
    return err instanceof TenantScopeError;
  }
}

async function main(): Promise<void> {
  const tenantA = await db.tenant.create({ data: { name: "[AUDIT] Tenant A", slug: SLUG_A } });
  const tenantB = await db.tenant.create({ data: { name: "[AUDIT] Tenant B", slug: SLUG_B } });
  const A = tenantDb(tenantA.id);
  const B = tenantDb(tenantB.id);

  const reports: TableReport[] = [];
  let failed = false;

  function record(table: string, checks: Check[]): void {
    const allPass = checks.every((c) => c.pass);
    if (!allPass) failed = true;
    reports.push({ table, checks });
  }

  // ───────────────────────────────── helpers de checagem ─────────────────────────────────
  async function crossRead(tdbB: TenantClient, delegate: "user" | "apiToken" | "search" | "searchCell" | "lead" | "template" | "campaign" | "campaignLead" | "creative" | "activity" | "webhook" | "webhookDelivery" | "suppressionEntry" | "billingEvent", rowId: string): Promise<boolean> {
    // @ts-expect-error — acesso genérico deliberado ao delegate para a auditoria
    const rows = await tdbB[delegate].findMany({ where: { id: rowId } });
    return Array.isArray(rows) && rows.length === 0;
  }

  async function crossWrite(tdbB: TenantClient, delegate: Parameters<typeof crossRead>[1], rowId: string, data: Record<string, unknown>): Promise<number> {
    // @ts-expect-error — acesso genérico deliberado ao delegate para a auditoria
    const res = await tdbB[delegate].updateMany({ where: { id: rowId }, data });
    return typeof res === "object" && res !== null && "count" in res ? (res as { count: number }).count : -1;
  }

  async function auditGeneric(
    table: string,
    tdbA: TenantClient,
    tdbB: TenantClient,
    delegate: Parameters<typeof crossRead>[1],
    createData: Record<string, unknown>,
    updateData: Record<string, unknown>
  ): Promise<void> {
    const checks: Check[] = [];
    // @ts-expect-error — acesso genérico deliberado ao delegate para a auditoria
    const rowA = await tdbA[delegate].create({ data: createData });
    const rowId = (rowA as { id: string }).id;

    checks.push({ name: "leitura cruzada retorna vazia", pass: await crossRead(tdbB, delegate, rowId) });
    checks.push({ name: "escrita cruzada afeta 0 linhas", pass: (await crossWrite(tdbB, delegate, rowId, updateData)) === 0 });
    checks.push({
      name: "create com tenantId estranho é bloqueado",
      pass: await expectTenantScopeError(() =>
        // @ts-expect-error — acesso genérico deliberado ao delegate para a auditoria
        tdbB[delegate].create({ data: { ...createData, tenantId: tenantA.id } })
      ),
    });
    checks.push({
      name: "findUnique proibido pelo guard",
      pass: await expectTenantScopeError(() =>
        // @ts-expect-error — acesso genérico deliberado ao delegate para a auditoria
        tdbA[delegate].findUnique({ where: { id: rowId } })
      ),
    });
    record(table, checks);
  }

  // ───────────────────────────────── setup compartilhado ─────────────────────────────────
  // tenantId explícito (igual ao do guard) — o guard valida/injeta em runtime.
  const searchA = await A.search.create({ data: { tenantId: tenantA.id, term: "audit search A" } });
  const searchB = await B.search.create({ data: { tenantId: tenantB.id, term: "audit search B" } });
  const cellA = await A.searchCell.create({
    data: { tenantId: tenantA.id, searchId: searchA.id, depth: 0, latMin: -16.7, lngMin: -49.3, latMax: -16.6, lngMax: -49.2 },
  });
  const leadA = await A.lead.create({
    data: { tenantId: tenantA.id, placeId: `place_${SUFFIX}`, name: "[AUDIT] Lead A", websiteType: "none", temperature: "hot" },
  });
  const leadB = await B.lead.create({
    data: { tenantId: tenantB.id, placeId: `place_${SUFFIX}`, name: "[AUDIT] Lead B", websiteType: "none", temperature: "hot" },
  });
  const campaignA = await A.campaign.create({ data: { tenantId: tenantA.id, name: "[AUDIT] Campanha A" } });

  // ───────────────────────────────── 13 tabelas ─────────────────────────────────
  await auditGeneric("users", A, B, "user", { email: `audit-${SUFFIX}-a@x.test`, name: "Audit A" }, { name: "x" });
  await auditGeneric("api_tokens", A, B, "apiToken", { name: "t", tokenHash: `hash_a_${SUFFIX}`, tokenPrefix: "pgs_live_a…" }, { name: "x" });
  await auditGeneric("searches", A, B, "search", { term: "audit" }, { term: "x" });
  await auditGeneric(
    "search_cells",
    A,
    B,
    "searchCell",
    { searchId: searchA.id, depth: 1, latMin: 1, lngMin: 1, latMax: 2, lngMax: 2 },
    { found: 9 }
  );
  await auditGeneric("leads", A, B, "lead", { placeId: `pl_${SUFFIX}_a`, name: "Lead A2" }, { name: "x" });
  await auditGeneric("templates", A, B, "template", { name: "tpl", body: "olá {{nome}}" }, { name: "x" });
  await auditGeneric("campaigns", A, B, "campaign", { name: "camp" }, { name: "x" });
  await auditGeneric(
    "campaign_leads",
    A,
    B,
    "campaignLead",
    { campaignId: campaignA.id, leadId: leadA.id },
    { status: "sent" }
  );
  await auditGeneric("creatives", A, B, "creative", { fileKey: "k", fileName: "f.png", mimeType: "image/png", sizeBytes: 1 }, { caption: "x" });
  await auditGeneric("activities", A, B, "activity", { type: "audit.event" }, { dataJson: "{\"a\":2}" });
  await auditGeneric("webhooks", A, B, "webhook", { url: "https://example.test/hook", secret: "s", eventsJson: "[]" }, { active: false });
  await auditGeneric("suppression_list", A, B, "suppressionEntry", { phoneE164: `+55620000${SUFFIX.slice(-4)}`, reason: "manual" }, { note: "x" });
  await auditGeneric("billing_events", A, B, "billingEvent", { provider: "stripe", eventId: `evt_${SUFFIX}_a`, type: "audit", payloadJson: "{}" }, { type: "x2" });

  // Dedup por place_id é POR TENANT: mesmo place_id em A e B deve coexistir.
  const bothExist =
    (await A.lead.count({ where: { placeId: `place_${SUFFIX}` } })) === 1 &&
    (await B.lead.count({ where: { placeId: `place_${SUFFIX}` } })) === 1;
  record("leads (unicidade composta)", [{ name: "mesmo place_id coexiste em tenants diferentes", pass: bothExist }]);

  // A célula criada no tenant A não pode ser vista via busca do tenant B.
  const cellLeak = await B.searchCell.findMany({ where: { searchId: searchA.id } });
  record("search_cells (fk cruzada)", [{ name: "searchId de outro tenant não é visível", pass: cellLeak.length === 0 }]);

  // Tenant B não pode marcar a célula de A como saturada.
  const crossCell = await B.searchCell.updateMany({
    where: { id: cellA.id },
    data: { status: "saturated" },
  });
  record("search_cells (escrita via searchId)", [{ name: "update cruzado afeta 0 linhas", pass: crossCell.count === 0 }]);

  // Lead do tenant B não pode entrar em campanha do tenant A por onde quer que se tente.
  try {
    await A.campaignLead.create({ data: { campaignId: campaignA.id, leadId: leadB.id, tenantId: tenantB.id } });
    record("campaign_leads (lead de outro tenant)", [{ name: "create com lead estranho é bloqueado", pass: false }]);
  } catch (err) {
    record("campaign_leads (lead de outro tenant)", [
      { name: "create com lead estranho é bloqueado", pass: err instanceof TenantScopeError || err instanceof Prisma.PrismaClientKnownRequestError },
    ]);
  }

  // ───────────────────────────────── relatório ─────────────────────────────────
  console.log("\n═══ AUDITORIA DE ISOLAMENTO MULTI-TENANT ═══\n");
  for (const rep of reports) {
    const ok = rep.checks.every((c) => c.pass);
    console.log(`${ok ? "✔" : "✘"} ${rep.table}`);
    for (const c of rep.checks) {
      console.log(`   ${c.pass ? "✔" : "✘"} ${c.name}${c.detail ? ` (${c.detail})` : ""}`);
    }
  }
  const total = reports.reduce((acc, r) => acc + r.checks.length, 0);
  const passed = reports.reduce((acc, r) => acc + r.checks.filter((c) => c.pass).length, 0);
  console.log(`\nResultado: ${passed}/${total} checagens · ${failed ? "FALHOU" : "TUDO ISOLADO"}`);

  // ───────────────────────────────── limpeza ─────────────────────────────────
  await db.tenant.delete({ where: { id: tenantA.id } });
  await db.tenant.delete({ where: { id: tenantB.id } });
  console.log("Tenants de auditoria removidos (cascade).");

  if (failed) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Auditoria abortou com erro:", err);
    process.exit(1);
  });
