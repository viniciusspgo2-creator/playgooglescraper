/**
 * Smoke utilitário da API v1 (Fase 3) — cria tenant/token DESCARTÁVEIS e
 * exercita verify → search/sync → leads/batch (JSON, gzip, idempotência,
 * dedup, credits_exhausted) contra o dev server real.
 * Uso: bun scripts/smoke-v1.ts
 * Limpeza: bun scripts/smoke-v1.ts --cleanup <tenantId>
 */
import { gzipSync } from "node:zlib";
import { randomUUID, createHash } from "node:crypto";

import { db } from "../src/lib/db";
import { generateRawToken } from "../src/server/tokens/service";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const ok = (label: string, cond: boolean, extra = "") =>
  console.log(`${cond ? "PASS" : "FAIL"} · ${label}${extra ? ` — ${extra}` : ""}`);

async function main() {
  const cleanupArg = process.argv.indexOf("--cleanup");
  if (cleanupArg > -1 && process.argv[cleanupArg + 1]) {
    const tenantId = process.argv[cleanupArg + 1] as string;
    await db.tenant.deleteMany({ where: { id: tenantId, name: { startsWith: "SMOKE-V1 " } } });
    console.log(JSON.stringify({ cleaned: tenantId }));
    return;
  }

  const stamp = randomUUID().slice(0, 8);
  const tenant = await db.tenant.create({
    data: {
      name: `SMOKE-V1 ${stamp}`,
      slug: `smoke-v1-${stamp}`,
      plan: "trial",
      leadCredits: 10, // pequeno de propósito: permite testar credits_exhausted
      leadCreditsUsed: 0,
      seats: 1,
    },
  });
  const user = await db.user.create({
    data: {
      tenantId: tenant.id,
      email: `smoke-v1-${stamp}@example.test`,
      name: "Smoke V1",
      passwordHash: "x",
      role: "owner",
      status: "active",
    },
  });
  const generated = generateRawToken(tenant.slug);
  await db.apiToken.create({
    data: {
      tenantId: tenant.id,
      name: "smoke",
      tokenHash: generated.hash,
      tokenPrefix: generated.prefix,
      scopesJson: JSON.stringify(["verify", "leads:read", "leads:write"]),
      createdById: user.id,
    },
  });
  const token = generated.raw;
  const auth = { Authorization: `Bearer ${token}` };

  console.log(`tenant=${tenant.id}`);

  // 1) verify
  const verify = await fetch(`${BASE}/api/v1/auth/verify`, { method: "POST", headers: auth });
  const verifyJson = (await verify.json()) as { ok: boolean; credits?: { remaining: number } };
  ok("verify 200 + remaining=10", verify.status === 200 && verifyJson.credits?.remaining === 10);

  // 2) search/sync
  const syncRes = await fetch(`${BASE}/api/v1/search/sync`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      search: {
        extId: `ext-search-${stamp}`,
        term: "barbearia",
        status: "running",
        speedMode: "moderate",
        centerLat: -16.68,
        centerLng: -49.25,
        radiusKm: 10,
        maxDepth: 4,
        cellsTotal: 1,
        cellsDone: 0,
        leadsFound: 0,
      },
      cells: [{ extId: `ext-cell-${stamp}`, depth: 0, latMin: -16.73, lngMin: -49.3, latMax: -16.63, lngMax: -49.2, status: "running" }],
    }),
  });
  const sync = (await syncRes.json()) as { ok: boolean; search: { id: string }; cells: Array<{ id: string }> };
  ok("search/sync 200 + ids mapeados", syncRes.status === 200 && Boolean(sync.search?.id) && sync.cells?.length === 1);
  const searchId = sync.search.id;
  const cellId = sync.cells[0]!.id;

  // 3) leads/batch JSON — 2 leads (quente sem site + morno social)
  const batchRes = await fetch(`${BASE}/api/v1/leads/batch`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      leads: [
        { place_id: `ChIJ${stamp}0001`, name: "Barbearia Corta Mais", phone_e164: "+55 62 99999-0001", website: null, category: "Barbearia", categories: ["Barbearia"], rating: 4.6, reviews_count: 42, claimed: false, search_id: searchId, cell_id: cellId, sources: { payload: ["name", "phone", "website"], dom: ["rating"] } },
        { place_id: `ChIJ${stamp}0002`, name: "Barbearia Social", phone_e164: "+5562988880002", website: "https://instagram.com/cortamais", rating: 3.9, reviews_count: 8, search_id: searchId, cell_id: cellId, sources: { dom: ["name", "phone"] } },
      ],
    }),
  });
  const batch = (await batchRes.json()) as { ok: boolean; created: number; updated: number; credits: { remaining: number }; strategyStats: Record<string, number> };
  ok("batch JSON criou 2 leads", batchRes.status === 200 && batch.created === 2, `credits=${batch.credits?.remaining} stats=${JSON.stringify(batch.strategyStats)}`);

  // heat checks direto no banco
  const l1 = await db.lead.findFirst({ where: { tenantId: tenant.id, placeId: `ChIJ${stamp}0001` } });
  const l2 = await db.lead.findFirst({ where: { tenantId: tenant.id, placeId: `ChIJ${stamp}0002` } });
  ok("lead quente: sem site, E.164 normalizado, whatsapp móvel", l1?.temperature === "hot" && l1?.phoneE164 === "+5562999990001" && l1?.heatScore >= 70, `heat=${l1?.heatScore}`);
  ok("lead morno: instagram = social/warm", l2?.temperature === "warm" && l2?.websiteType === "social", `heat=${l2?.heatScore}`);

  // 4) batch gzip + idempotência
  const payload = JSON.stringify({ leads: [{ place_id: `ChIJ${stamp}0003`, name: "Naipes Barbearia", website: "https://naipes.com.br", rating: 4.2, reviews_count: 30, search_id: searchId, cell_id: cellId }] });
  const key = createHash("sha256").update(payload).digest("hex");
  const gz = gzipSync(Buffer.from(payload, "utf8"));
  const gzRes = await fetch(`${BASE}/api/v1/leads/batch`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json", "Content-Encoding": "gzip", "Idempotency-Key": key },
    body: new Uint8Array(gz),
  });
  const gzJson = (await gzRes.json()) as { ok: boolean; created: number };
  const replayRes = await fetch(`${BASE}/api/v1/leads/batch`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json", "Content-Encoding": "gzip", "Idempotency-Key": key },
    body: new Uint8Array(gz),
  });
  const replayJson = (await replayRes.json()) as { created: number };
  ok("batch gzip criou 1 lead", gzRes.status === 200 && gzJson.created === 1);
  ok("retry idempotente não reprocessa (replay header)", replayRes.headers.get("x-idempotent-replay") === "true" && replayJson.created === gzJson.created);

  // 5) dedup update — 0001 volta agora COM site (quente → frio)
  const dedupRes = await fetch(`${BASE}/api/v1/leads/batch`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ leads: [{ place_id: `ChIJ${stamp}0001`, name: "Barbearia Corta Mais", website: "https://cortamais.com.br", search_id: searchId }] }),
  });
  const dedup = (await dedupRes.json()) as { ok: boolean; created: number; updated: number };
  const l1b = await db.lead.findFirst({ where: { tenantId: tenant.id, placeId: `ChIJ${stamp}0001` } });
  ok("dedup: update sem criar, temperatura resfriou", dedupRes.status === 200 && dedup.created === 0 && dedup.updated === 1 && l1b?.temperature === "cold", `heat=${l1b?.heatScore}`);

  // 6) créditos exatos — tenant tem 10; já usou 3; envia 7 novos (fecha 10)
  const overflow = Array.from({ length: 7 }, (_, i) => ({ place_id: `ChIJ${stamp}0${String(i + 11).padStart(2, "0")}`, name: `L ${i}`, search_id: searchId }));
  const overflowRes = await fetch(`${BASE}/api/v1/leads/batch`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ leads: overflow }),
  });
  const overflowJson = (await overflowRes.json()) as { ok: boolean; created: number; credits: { remaining: number } };
  const fresh2 = await db.tenant.findUnique({ where: { id: tenant.id } });
  ok("lote fecha exatamente os 10 créditos", overflowRes.status === 200 && overflowJson.created === 7 && fresh2?.leadCreditsUsed === 10, `used=${fresh2?.leadCreditsUsed}`);

  // 6b) 1 lead extra → credits_exhausted
  const extraRes = await fetch(`${BASE}/api/v1/leads/batch`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ leads: [{ place_id: `ChIJ${stamp}0099`, name: "Extra", search_id: searchId }] }),
  });
  const extraJson = (await extraRes.json()) as { ok: boolean; error?: { code: string }; created: number };
  ok("credits_exhausted → 402 + código", extraRes.status === 402 && extraJson.error?.code === "credits_exhausted", `created=${extraJson.created}`);
  const fresh = await db.tenant.findUnique({ where: { id: tenant.id } });
  ok("créditos continuam em 10", fresh?.leadCreditsUsed === 10, `used=${fresh?.leadCreditsUsed}`);

  // 7) token inválido e sem escopo
  const bad = await fetch(`${BASE}/api/v1/leads/batch`, { method: "POST", headers: { Authorization: "Bearer pgs_live_xxx_yy" }, body: "{}" });
  ok("token inválido → 401", bad.status === 401);

  console.log(`cleanup: bun scripts/smoke-v1.ts --cleanup ${tenant.id}`);
}

void main();
