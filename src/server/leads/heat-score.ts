/**
 * heat_score 0–100 — fórmula versionada (ADR-002 §D6), calculada SOMENTE no
 * servidor na ingestão. Pesos podem ser sobrescritos por tenant em
 * `tenant.settingsJson.heatWeights` (o tenant configura; a fórmula não muda).
 *
 * Pontuação bruta (máx. 82):
 *   sem site +35 | apenas social +18 (mutuamente exclusivos)
 *   rating ≥ 4.0 +12 | reviews ≥ 15 +10 | telefone E.164 válido +10
 *   WhatsApp (móvel) válido +8 | perfil não reivindicado +2 | categoria-alvo +5
 * Normalização final: round(raw / 82 × 100), clamp 0–100.
 */
import type { LeadTemperature } from "@/shared/contracts";
import { temperatureFromWebsite, type LeadWebsiteType } from "@/shared/contracts";

export const HEAT_RAW_MAX = 82;

export type HeatWeights = {
  noSite: number;
  socialOnly: number;
  rating4: number;
  reviews15: number;
  phoneValid: number;
  whatsappValid: number;
  unclaimed: number;
  targetCategory: number;
};

export const DEFAULT_HEAT_WEIGHTS: HeatWeights = {
  noSite: 35,
  socialOnly: 18,
  rating4: 12,
  reviews15: 10,
  phoneValid: 10,
  whatsappValid: 8,
  unclaimed: 2,
  targetCategory: 5,
};

/** Lê os pesos do tenant (settingsJson.heatWeights), com fallback aos defaults. */
export function resolveHeatWeights(settingsJson: string | null | undefined): HeatWeights {
  if (!settingsJson) return DEFAULT_HEAT_WEIGHTS;
  try {
    const parsed: unknown = JSON.parse(settingsJson);
    const raw = (parsed as { heatWeights?: Partial<HeatWeights> } | null)?.heatWeights;
    if (!raw || typeof raw !== "object") return DEFAULT_HEAT_WEIGHTS;
    const out = { ...DEFAULT_HEAT_WEIGHTS };
    for (const key of Object.keys(DEFAULT_HEAT_WEIGHTS) as (keyof HeatWeights)[]) {
      const value = raw[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 50) {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return DEFAULT_HEAT_WEIGHTS;
  }
}

export type HeatInput = {
  websiteType: LeadWebsiteType;
  rating: number | null;
  reviewsCount: number | null;
  phoneValid: boolean;
  whatsappValid: boolean;
  claimed: boolean | null;
  /** true quando a categoria primária casa com o termo/objetivo da busca. */
  isTargetCategory: boolean;
};

export function computeHeatRaw(input: HeatInput, weights: HeatWeights): number {
  let raw = 0;
  if (input.websiteType === "none") raw += weights.noSite;
  else if (input.websiteType === "social") raw += weights.socialOnly;
  if (input.rating !== null && input.rating >= 4.0) raw += weights.rating4;
  if (input.reviewsCount !== null && input.reviewsCount >= 15) raw += weights.reviews15;
  if (input.phoneValid) raw += weights.phoneValid;
  if (input.whatsappValid) raw += weights.whatsappValid;
  if (input.claimed === false) raw += weights.unclaimed;
  if (input.isTargetCategory) raw += weights.targetCategory;
  return raw;
}

export function computeHeatScore(input: HeatInput, weights: HeatWeights): number {
  const raw = computeHeatRaw(input, weights);
  const normalized = Math.round((raw / HEAT_RAW_MAX) * 100);
  return Math.min(100, Math.max(0, normalized));
}

export function heatTemperature(websiteType: LeadWebsiteType): LeadTemperature {
  return temperatureFromWebsite(websiteType);
}
