/**
 * Contratos compartilhados web ↔ extensão (packages/shared na spec original).
 * Fonte única de verdade para tipos trocados pela API /api/v1 e pela extensão MV3.
 */

/** Origem da extração de cada campo — sempre logada (ADR-002, D1). */
export const EXTRACT_SOURCES = ["payload", "dom", "detail"] as const;
export type ExtractSource = (typeof EXTRACT_SOURCES)[number];

/** Classificação comercial do website do lead (ouro do funil de venda de sites). */
export const WEBSITE_TYPES = ["none", "social", "own"] as const;
export type LeadWebsiteType = (typeof WEBSITE_TYPES)[number];

/** Temperatura derivada do tipo de site. */
export type LeadTemperature = "hot" | "warm" | "cold";

/** Etapas do Kanban (Fase 6). */
export const KANBAN_STAGES = [
  "waiting",
  "interested",
  "refused",
  "closed",
  "production",
] as const;
export type KanbanStage = (typeof KANBAN_STAGES)[number];

/** Modos de velocidade do humanizador (ADR-002, D3). */
export const SPEED_MODES = ["stealth", "moderate", "fast", "turbo"] as const;
export type SpeedMode = (typeof SPEED_MODES)[number];

/** Payload de lote enviado pela extensão em POST /api/v1/leads/batch (Fase 3/4). */
export type LeadBatchItem = {
  place_id: string;
  cid: string | null;
  name: string;
  phone_e164: string | null;
  website: string | null;
  website_type: LeadWebsiteType;
  email: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  plus_code: string | null;
  category: string | null;
  categories: string[];
  rating: number | null;
  reviews_count: number | null;
  price_level: number | null;
  photos_count: number | null;
  claimed: boolean | null;
  search_id: string;
  cell_id: string | null;
  sources: Partial<Record<ExtractSource, string[]>>;
};

/**websiteType → temperatura (classificação QUENTE/MORNO/FRIO, calculada no servidor). */
export function temperatureFromWebsite(type: LeadWebsiteType): LeadTemperature {
  switch (type) {
    case "none":
      return "hot";
    case "social":
      return "warm";
    case "own":
      return "cold";
  }
}
