/**
 * Ingestão de leads (Fase 3) — POST /api/v1/leads/batch.
 *
 * Regras da spec:
 *  - Dedup POR TENANT por place_id (unicidade composta) + dedup dentro do lote.
 *  - Todo campo classificador é RECALCULADO no servidor (classify + heat_score).
 *  - 1 crédito = 1 lead NOVO. Updates de dedup não consomem crédito.
 *  - Créditos reservados atomicamente ANTES de criar (otimista por igualdade);
 *    sem crédito → 402 credits_exhausted, updates ainda processados.
 *  - Telemetria por estratégia (payload/dom/detail) agregada por lote.
 *  - Eventos webhook lead.created enfileirados (entrega assíncrona, Fase 8).
 */
import { db } from "@/lib/db";
import { tenantDb } from "@/server/tenancy/tenant-guard";
import { classifyWebsite, normalizePhone, normalizeWebsite } from "@/server/leads/classify";
import { computeHeatScore, resolveHeatWeights, type HeatWeights } from "@/server/leads/heat-score";
import { enqueueDeliveries } from "@/server/webhooks/service";
import { temperatureFromWebsite } from "@/shared/contracts";
import type { ExtractSource, LeadWebsiteType } from "@/shared/contracts";
import type { LeadBatchItemInput } from "@/shared/schemas";

export type IngestOutcome = {
  blocked: false;
  created: number;
  updated: number;
  duplicatesInBatch: number;
  creditsRemaining: number;
  strategyStats: Record<ExtractSource, number>;
  webhookEvents: number;
};

export type IngestBlocked = {
  blocked: true;
  created: 0;
  updated: number;
  duplicatesInBatch: number;
  creditsRemaining: number;
  strategyStats: Record<ExtractSource, number>;
  webhookEvents: 0;
};

const SOURCES: ExtractSource[] = ["payload", "dom", "detail"];

function emptyStats(): Record<ExtractSource, number> {
  return { payload: 0, dom: 0, detail: 0 };
}

function dominantStrategy(sources: Partial<Record<ExtractSource, string[]>>): ExtractSource | null {
  let best: ExtractSource | null = null;
  let bestCount = 0;
  for (const source of SOURCES) {
    const count = sources[source]?.length ?? 0;
    if (count > bestCount) {
      best = source;
      bestCount = count;
    }
  }
  return best;
}

function accumulateStats(stats: Record<ExtractSource, number>, item: LeadBatchItemInput): void {
  for (const source of SOURCES) {
    stats[source] += item.sources?.[source]?.length ?? 0;
  }
}

function tokenizeTerm(term: string): string[] {
  return term
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[\s,;/]+/)
    .filter((t) => t.length >= 3)
    .slice(0, 8);
}

/** Categoria-alvo: alguma categoria do lead casa com um token do termo da busca. */
function isTargetCategory(categories: string[], termTokens: string[]): boolean {
  if (categories.length === 0 || termTokens.length === 0) return false;
  const haystack = categories.join(" ").toLowerCase();
  return termTokens.some((token) => haystack.includes(token));
}

type ExistingLead = {
  id: string;
  placeId: string;
  phoneE164: string | null;
  phoneRaw: string | null;
  website: string | null;
  email: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  plusCode: string | null;
  rating: number | null;
  reviewsCount: number | null;
  priceLevel: number | null;
  photosCount: number | null;
  claimed: boolean | null;
  categoriesJson: string;
  primaryCategory: string | null;
  searchId: string | null;
  cellId: string | null;
};

type ComputeResult = {
  phoneE164: string | null;
  phoneRaw: string | null;
  whatsappValid: boolean;
  website: string | null;
  websiteType: LeadWebsiteType;
  temperature: string;
  hasSite: boolean;
  categoriesJson: string;
  categoriesText: string;
  primaryCategory: string | null;
  rating: number | null;
  reviewsCount: number | null;
  priceLevel: number | null;
  photosCount: number | null;
  claimed: boolean | null;
  heatScore: number;
  sourcesJson: string;
  sourceStrategy: ExtractSource | null;
};

/**
 * Mescla item novo com lead existente (campos vazios são preenchidos) e
 * recalcula temperatura + heat_score. Puro — sem I/O.
 */
function computeMerged(item: LeadBatchItemInput, existing: ExistingLead | null, weights: HeatWeights, termTokens: string[]): ComputeResult {
  const incomingPhone = normalizePhone(item.phone_e164 ?? item.phone_raw ?? null);
  const incomingWebsite = normalizeWebsite(item.website);

  const phoneE164 = existing?.phoneE164 ?? incomingPhone.e164;
  const phoneRaw = existing?.phoneRaw ?? item.phone_raw ?? item.phone_e164 ?? null;
  const website = existing?.website ?? incomingWebsite;
  const whatsappValid = incomingPhone.whatsapp;

  const incomingCategories = (item.categories ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 20);
  const existingCategories = safeParseArray(existing?.categoriesJson);
  const categories = existingCategories.length > 0 ? existingCategories : incomingCategories;
  const incomingPrimary = item.category?.trim() || incomingCategories[0] || null;
  const primaryCategory = existing?.primaryCategory ?? incomingPrimary;

  const websiteType = classifyWebsite(website);
  const temperature = temperatureFromWebsite(websiteType);

  const rating = existing?.rating ?? item.rating ?? null;
  const reviewsCount = existing?.reviewsCount ?? item.reviews_count ?? null;
  const claimed = existing?.claimed ?? item.claimed ?? null;

  const target = isTargetCategory(
    primaryCategory ? [primaryCategory, ...categories] : categories,
    termTokens
  );

  const heatScore = computeHeatScore(
    {
      websiteType,
      rating,
      reviewsCount,
      phoneValid: Boolean(phoneE164),
      whatsappValid,
      claimed,
      isTargetCategory: target,
    },
    weights
  );

  return {
    phoneE164,
    phoneRaw,
    whatsappValid,
    website,
    websiteType,
    temperature,
    hasSite: websiteType !== "none",
    categoriesJson: JSON.stringify(categories),
    categoriesText: categories.join(", ").slice(0, 512),
    primaryCategory,
    rating,
    reviewsCount,
    priceLevel: existing?.priceLevel ?? item.price_level ?? null,
    photosCount: existing?.photosCount ?? item.photos_count ?? null,
    claimed,
    heatScore,
    sourcesJson: JSON.stringify(item.sources ?? {}),
    sourceStrategy: dominantStrategy(item.sources ?? {}),
  };
}

function safeParseArray(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export async function processLeadBatch(
  tenantId: string,
  items: LeadBatchItemInput[]
): Promise<IngestOutcome | IngestBlocked> {
  const tdb = tenantDb(tenantId);

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { leadCredits: true, leadCreditsUsed: true, settingsJson: true },
  });
  if (!tenant) throw new Error("tenant_not_found");
  const weights: HeatWeights = resolveHeatWeights(tenant.settingsJson);

  // ── Dedup dentro do lote (mantém a 1ª ocorrência de cada place_id)
  const seen = new Set<string>();
  const uniqueItems: LeadBatchItemInput[] = [];
  for (const item of items) {
    if (seen.has(item.place_id)) continue;
    seen.add(item.place_id);
    uniqueItems.push(item);
  }
  const duplicatesInBatch = items.length - uniqueItems.length;

  // ── Cache dos termos das buscas envolvidas (categoria-alvo) e validade
  const searchIds = [...new Set(uniqueItems.map((i) => i.search_id))];
  const searchTermTokens = new Map<string, string[]>();
  for (const searchId of searchIds) {
    const search = await tdb.search.findFirst({ where: { id: searchId }, select: { id: true, term: true } });
    if (search) searchTermTokens.set(searchId, tokenizeTerm(search.term));
  }

  // ── Leads existentes deste tenant entre os place_ids do lote
  const placeIds = uniqueItems.map((i) => i.place_id);
  const existingLeads = await tdb.lead.findMany({
    where: { placeId: { in: placeIds } },
    select: {
      id: true,
      placeId: true,
      phoneE164: true,
      phoneRaw: true,
      website: true,
      email: true,
      address: true,
      lat: true,
      lng: true,
      plusCode: true,
      rating: true,
      reviewsCount: true,
      priceLevel: true,
      photosCount: true,
      claimed: true,
      categoriesJson: true,
      primaryCategory: true,
      searchId: true,
      cellId: true,
    },
  });
  const existingByPlace = new Map(existingLeads.map((l) => [l.placeId, l]));
  const newItems = uniqueItems.filter((i) => !existingByPlace.has(i.place_id));

  // ── Reserva atômica de créditos para leads NOVOS (otimista por igualdade)
  let creditsRemaining = Math.max(tenant.leadCredits - tenant.leadCreditsUsed, 0);
  let reserved = newItems.length === 0;
  for (let attempt = 0; attempt < 3 && !reserved; attempt += 1) {
    const fresh = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { leadCredits: true, leadCreditsUsed: true },
    });
    if (!fresh) throw new Error("tenant_not_found");
    const currentUsed = fresh.leadCreditsUsed;
    const targetUsed = currentUsed + newItems.length;
    if (targetUsed > fresh.leadCredits) {
      creditsRemaining = Math.max(fresh.leadCredits - currentUsed, 0);
      break;
    }
    const updated = await db.tenant.updateMany({
      where: { id: tenantId, leadCreditsUsed: currentUsed },
      data: { leadCreditsUsed: targetUsed },
    });
    reserved = updated.count === 1;
  }

  if (!reserved) {
    // Sem crédito para os novos: processa apenas updates (não consomem crédito).
    const stats = emptyStats();
    let updated = 0;
    for (const item of uniqueItems) {
      const existing = existingByPlace.get(item.place_id);
      if (!existing) continue;
      accumulateStats(stats, item);
      const merged = computeMerged(item, existing, weights, searchTermTokens.get(item.search_id) ?? []);
      const res = await tdb.lead.updateMany({
        where: { id: existing.id },
        data: { ...updateDataFrom(merged, item, searchTermTokens.has(item.search_id)), lastSeenAt: new Date() },
      });
      updated += res.count;
    }
    return {
      blocked: true,
      created: 0,
      updated,
      duplicatesInBatch,
      creditsRemaining,
      strategyStats: stats,
      webhookEvents: 0,
    };
  }

  // ── Processa o lote
  const stats = emptyStats();
  let created = 0;
  let updated = 0;
  const webhookEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const now = new Date();

  for (const item of uniqueItems) {
    accumulateStats(stats, item);
    const termTokens = searchTermTokens.get(item.search_id) ?? [];
    const searchValid = searchTermTokens.has(item.search_id);
    const existing = existingByPlace.get(item.place_id);
    const merged = computeMerged(item, existing ?? null, weights, termTokens);

    if (!existing) {
      if (!searchValid) continue; // busca inexistente → lead rejeitado
      const lead = await tdb.lead.create({
        data: {
          tenantId,
          placeId: item.place_id,
          cid: item.cid ?? null,
          name: item.name,
          phoneE164: merged.phoneE164,
          phoneRaw: merged.phoneRaw,
          website: merged.website,
          websiteType: merged.websiteType,
          temperature: merged.temperature,
          hasSite: merged.hasSite,
          heatScore: merged.heatScore,
          email: item.email ?? null,
          address: item.address ?? null,
          lat: item.lat ?? null,
          lng: item.lng ?? null,
          plusCode: item.plus_code ?? null,
          categoriesJson: merged.categoriesJson,
          categoriesText: merged.categoriesText,
          primaryCategory: merged.primaryCategory,
          rating: merged.rating,
          reviewsCount: merged.reviewsCount,
          priceLevel: merged.priceLevel,
          photosCount: merged.photosCount,
          claimed: merged.claimed,
          searchId: item.search_id,
          cellId: item.cell_id ?? null,
          sourceStrategy: merged.sourceStrategy,
          sourcesJson: merged.sourcesJson,
        },
      });
      created += 1;
      webhookEvents.push({
        event: "lead.created",
        payload: {
          leadId: lead.id,
          placeId: lead.placeId,
          name: lead.name,
          temperature: lead.temperature,
          heatScore: lead.heatScore,
          websiteType: lead.websiteType,
          searchId: lead.searchId,
        },
      });
    } else {
      const res = await tdb.lead.updateMany({
        where: { id: existing.id },
        data: { ...updateDataFrom(merged, item, searchValid), lastSeenAt: now },
      });
      updated += res.count;
    }
  }

  let webhookEventCount = 0;
  if (webhookEvents.length > 0) {
    webhookEventCount = await enqueueDeliveries(tenantId, webhookEvents);
  }

  await tdb.activity.create({
    data: {
      tenantId,
      type: "leads.batch_ingested",
      dataJson: JSON.stringify({ created, updated, duplicatesInBatch, sources: stats }),
    },
  });

  return {
    blocked: false,
    created,
    updated,
    duplicatesInBatch,
    creditsRemaining,
    strategyStats: stats,
    webhookEvents: webhookEventCount,
  };
}

/** Dados de update a partir do merge — campos `undefined` não são alterados pelo Prisma. */
function updateDataFrom(
  merged: ComputeResult,
  item: LeadBatchItemInput,
  searchValid: boolean
): Record<string, unknown> {
  return {
    phoneE164: merged.phoneE164,
    phoneRaw: merged.phoneRaw,
    website: merged.website,
    websiteType: merged.websiteType,
    temperature: merged.temperature,
    hasSite: merged.hasSite,
    heatScore: merged.heatScore,
    email: item.email ?? undefined,
    address: item.address ?? undefined,
    lat: item.lat ?? undefined,
    lng: item.lng ?? undefined,
    plusCode: item.plus_code ?? undefined,
    categoriesJson: merged.categoriesJson,
    categoriesText: merged.categoriesText,
    primaryCategory: merged.primaryCategory,
    rating: merged.rating,
    reviewsCount: merged.reviewsCount,
    priceLevel: merged.priceLevel,
    photosCount: merged.photosCount,
    claimed: merged.claimed,
    searchId: item.search_id,
    cellId: item.cell_id ?? undefined,
    sourceStrategy: merged.sourceStrategy,
    sourcesJson: merged.sourcesJson,
  };
}
