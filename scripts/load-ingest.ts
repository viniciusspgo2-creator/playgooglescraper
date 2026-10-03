/**
 * Load test de ingestão (Fase 10) — 50.000 leads pela API REAL.
 * Cria tenant/token descartáveis, dispara 250 lotes de 200 leads com
 * concorrência, mede tempo/throughput e confirma a contagem no banco.
 * Uso: bun scripts/load-ingest.ts [total=50000] [concurrency=8]
 * Limpeza: bun scripts/load-ingest.ts --cleanup <tenantId>
 */
import { gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";

import { db } from "../src/lib/db";
import { generateRawToken } from "../src/server/tokens/service";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const FIRST_NAMES = ["Padaria", "Barbearia", "Clinica", "Restaurante", "PetShop", "AutoCenter", "Farmacia", "Boutique", "Pizzaria", "Studio"];
const LAST_NAMES = ["Central", "do Bairro", "Premium", "Express", " & Cia", "Real", "Nova", "Top", "Plus", "Prime"];
const CATEGORIES = ["Alimentacao", "Beleza", "Saude", "Automotivo", "Servicos", "Moda", "Educacao", "Lazer"];

function makeLead(i: number, searchId: string) {
  const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7) % LAST_NAMES.length]} ${i}`;
  const withSite = i % 3 === 0;
  const social = !withSite && i % 5 === 0;
  return {
    place_id: `load_${i.toString().padStart(7, "0")}_${randomUUID().slice(0, 8)}`,
    name,
    phone_e164: i % 4 === 0 ? null : `+55629${(80000000 + i).toString().slice(0, 8)}`,
    website: withSite ? `https://site${i}.com.br` : social ? "https://instagram.com/perfil" : null,
    category: CATEGORIES[i % CATEGORIES.length]!,
    categories: [CATEGORIES[i % CATEGORIES.length]!],
    rating: Math.round((3 + ((i * 13) % 20) / 10) * 10) / 10,
    reviews_count: (i * 31) % 400,
    claimed: i % 6 === 0,
    search_id: searchId,
    sources: { payload: ["name", "phone", "website", "rating"] },
  };
}

async function main() {
  const cleanupArg = process.argv.indexOf("--cleanup");
  if (cleanupArg > -1 && process.argv[cleanupArg + 1]) {
    const tenantId = process.argv[cleanupArg + 1] as string;
    await db.tenant.deleteMany({ where: { id: tenantId, name: { startsWith: "LOAD-TEST " } } });
    console.log(JSON.stringify({ cleaned: tenantId }));
    return;
  }

  const TOTAL = Number(process.argv[2] ?? 50_000);
  const CONCURRENCY = Number(process.argv[3] ?? 8);
  const BATCH = 200;
  const stamp = randomUUID().slice(0, 8);

  const tenant = await db.tenant.create({
    data: { name: `LOAD-TEST ${stamp}`, slug: `load-${stamp}`, plan: "business", leadCredits: TOTAL + 1000, leadCreditsUsed: 0, seats: 1 },
  });
  const user = await db.user.create({
    data: { tenantId: tenant.id, email: `load-${stamp}@example.test`, name: "Load", passwordHash: "x", role: "owner" },
  });
  const generated = generateRawToken(tenant.slug);
  await db.apiToken.create({
    data: { tenantId: tenant.id, name: "load", tokenHash: generated.hash, tokenPrefix: generated.prefix, scopesJson: JSON.stringify(["verify", "leads:read", "leads:write"]), createdById: user.id },
  });
  const search = await db.search.create({ data: { tenantId: tenant.id, term: "load test", status: "running", extId: `ext-load-${stamp}` } });

  console.log(`tenant=${tenant.id} total=${TOTAL} batch=${BATCH} concurrency=${CONCURRENCY}`);
  const t0 = Date.now();

  const batches: Array<Record<string, unknown>> = [];
  for (let start = 0; start < TOTAL; start += BATCH) {
    const leads = Array.from({ length: Math.min(BATCH, TOTAL - start) }, (_, k) => makeLead(start + k, search.id));
    batches.push({ leads });
  }

  let done = 0;
  let errors = 0;
  let rateLimited = 0;
  const times: number[] = [];

  // Pacing global: 110 req/min (respeita o rate limit real de 120/min por token
  // — a extensão de verdade, com lotes de 25 e ritmo humanizado, fica muito abaixo).
  const MIN_INTERVAL_MS = 60_000 / 110;
  let nextSlot = Date.now();
  async function throttle(): Promise<void> {
    // Reserva serializada de slot (JS single-thread): cada request ganha um
    // horário próprio espaçado ≥ MIN_INTERVAL_MS do anterior.
    nextSlot += MIN_INTERVAL_MS;
    const wait = nextSlot - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  async function worker(): Promise<void> {
    for (;;) {
      const idx = done;
      if (idx >= batches.length) return;
      done += 1;
      await throttle();
      const body = JSON.stringify(batches[idx]!);
      const key = (await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)));
      const keyHex = Array.from(new Uint8Array(key)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const gz = gzipSync(Buffer.from(body, "utf8"));
      const s = Date.now();
      const res = await fetch(`${BASE}/api/v1/leads/batch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${generated.raw}`, "Content-Type": "application/json", "Content-Encoding": "gzip", "Idempotency-Key": keyHex },
        body: new Uint8Array(gz),
      });
      times.push(Date.now() - s);
      if (res.status === 429) rateLimited += 1;
      if (res.status !== 200) errors += 1;
      if (done % 50 === 0) {
        const elapsed = (Date.now() - t0) / 1000;
        console.log(`  ${done}/${batches.length} lotes · ${elapsed.toFixed(1)}s`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const elapsed = (Date.now() - t0) / 1000;
  const count = await db.lead.count({ where: { tenantId: tenant.id } });
  const avgBatch = times.reduce((a, b) => a + b, 0) / (times.length || 1);
  const p95 = times.slice().sort((a, b) => a - b)[Math.floor(times.length * 0.95)] ?? 0;
  const tenantFresh = await db.tenant.findUnique({ where: { id: tenant.id } });

  console.log("── resultado ──");
  console.log(`leads inseridos: ${count}/${TOTAL}`);
  console.log(`tempo total: ${elapsed.toFixed(1)}s · throughput: ${Math.round(TOTAL / elapsed)} leads/s`);
  console.log(`latência por lote(200): média ${avgBatch.toFixed(0)}ms · p95 ${p95}ms`);
  console.log(`lotes com erro: ${errors} (429: ${rateLimited}) · créditos usados: ${tenantFresh?.leadCreditsUsed}`);
  console.log(`cleanup: bun scripts/load-ingest.ts --cleanup ${tenant.id}`);
}

void main();
