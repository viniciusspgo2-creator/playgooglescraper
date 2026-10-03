/**
 * Schemas Zod compartilhados client ↔ server (validação nas duas pontas).
 * Fonte única dos contratos de entrada da Fase 2 (auth, membros, tokens).
 */
import { z } from "zod";

import { locales } from "@/i18n/config";

/** Política de senha: ≥8 chars, ≥1 letra, ≥1 dígito. */
export const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[A-Za-z]/)
  .regex(/[0-9]/);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(254),
  password: passwordSchema,
  company: z.string().trim().min(2).max(60),
  locale: z.enum(locales).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().trim().min(16).max(128),
  name: z.string().trim().min(2).max(80),
  password: passwordSchema,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const inviteMemberSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(["admin", "member"]),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateSessionSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  locale: z.enum(locales).optional(),
});
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

export const createTokenSchema = z.object({
  name: z.string().trim().min(2).max(60),
  scopes: z.array(z.enum(["verify", "leads:read", "leads:write"])).min(1).max(3),
  deviceLabel: z.string().trim().min(2).max(60).optional(),
});
export type CreateTokenInput = z.infer<typeof createTokenSchema>;

export function slugifyCompany(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/* ───────────────────────── API v1 (extensão ↔ sistema, Fase 3) ───────────────────────── */

const EXTRACT_SOURCE_VALUES = ["payload", "dom", "detail"] as const;
const WEBSITE_TYPE_VALUES = ["none", "social", "own"] as const;
const SPEED_MODE_VALUES = ["stealth", "moderate", "fast", "turbo"] as const;

export const leadBatchItemSchema = z.object({
  place_id: z.string().min(4).max(512),
  cid: z.string().max(128).nullable().optional(),
  name: z.string().min(1).max(256),
  phone_e164: z.string().max(32).nullable().optional(),
  phone_raw: z.string().max(32).nullable().optional(),
  website: z.string().max(512).nullable().optional(),
  website_type: z.enum(WEBSITE_TYPE_VALUES).optional(),
  email: z.string().max(254).nullable().optional(),
  address: z.string().max(512).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  plus_code: z.string().max(64).nullable().optional(),
  category: z.string().max(128).nullable().optional(),
  categories: z.array(z.string().max(128)).max(20).optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  reviews_count: z.number().int().min(0).max(10_000_000).nullable().optional(),
  price_level: z.number().int().min(0).max(4).nullable().optional(),
  photos_count: z.number().int().min(0).max(100_000).nullable().optional(),
  claimed: z.boolean().nullable().optional(),
  search_id: z.string().min(1).max(64),
  cell_id: z.string().max(64).nullable().optional(),
  sources: z.record(z.string(), z.array(z.string().max(64))).optional(),
});
export type LeadBatchItemInput = z.infer<typeof leadBatchItemSchema>;

export const leadBatchSchema = z.object({
  leads: z.array(leadBatchItemSchema).min(1).max(200),
});
export type LeadBatchInput = z.infer<typeof leadBatchSchema>;

const bboxSchema = z.object({
  latMin: z.number().min(-90).max(90),
  lngMin: z.number().min(-180).max(180),
  latMax: z.number().min(-90).max(90),
  lngMax: z.number().min(-180).max(180),
});

export const searchSyncSchema = z.object({
  search: z.object({
    extId: z.string().min(8).max(64),
    term: z.string().min(1).max(200),
    status: z.enum(["queued", "running", "paused", "done", "failed", "cancelled"]).optional(),
    speedMode: z.enum(SPEED_MODE_VALUES).optional(),
    bbox: bboxSchema.optional(),
    centerLat: z.number().min(-90).max(90).nullable().optional(),
    centerLng: z.number().min(-180).max(180).nullable().optional(),
    radiusKm: z.number().min(0.1).max(500).nullable().optional(),
    maxDepth: z.number().int().min(1).max(6).optional(),
    cellsTotal: z.number().int().min(0).max(1_000_000).optional(),
    cellsDone: z.number().int().min(0).max(1_000_000).optional(),
    leadsFound: z.number().int().min(0).max(10_000_000).optional(),
    lastError: z.string().max(500).nullable().optional(),
  }),
  cells: z
    .array(
      z.object({
        extId: z.string().min(8).max(64),
        depth: z.number().int().min(0).max(6),
        latMin: z.number().min(-90).max(90),
        lngMin: z.number().min(-180).max(180),
        latMax: z.number().min(-90).max(90),
        lngMax: z.number().min(-180).max(180),
        status: z.enum(["pending", "running", "saturated", "exhausted", "failed"]).optional(),
        found: z.number().int().min(0).max(100_000).optional(),
        attempts: z.number().int().min(0).max(10_000).optional(),
        lastError: z.string().max(500).nullable().optional(),
      })
    )
    .max(200),
});
export type SearchSyncInput = z.infer<typeof searchSyncSchema>;

/* ───────────────────────── Painel (rotas com sessão, Fases 5–8) ───────────────────────── */

export const createSearchSchema = z.object({
  term: z.string().trim().min(2).max(200),
  speedMode: z.enum(SPEED_MODE_VALUES).default("moderate"),
  centerLat: z.number().min(-90).max(90).optional(),
  centerLng: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().min(0.5).max(200).default(10),
  maxDepth: z.number().int().min(1).max(6).default(4),
});
export type CreateSearchInput = z.infer<typeof createSearchSchema>;

export const updateSearchSchema = z.object({
  status: z.enum(["queued", "running", "paused", "done", "failed", "cancelled"]),
});
export type UpdateSearchInput = z.infer<typeof updateSearchSchema>;

export const listLeadsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  stage: z.enum(["waiting", "interested", "refused", "closed", "production"]).optional(),
  temperature: z.enum(["hot", "warm", "cold"]).optional(),
  hasSite: z.enum(["true", "false"]).optional(),
  minHeat: z.coerce.number().int().min(0).max(100).optional(),
  maxHeat: z.coerce.number().int().min(0).max(100).optional(),
  searchId: z.string().max(64).optional(),
  category: z.string().trim().max(120).optional(),
  sort: z.enum(["heat", "recent", "rating", "reviews", "name"]).default("heat"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  perPage: z.coerce.number().int().min(10).max(100).default(25),
});
export type ListLeadsInput = z.infer<typeof listLeadsSchema>;

export const updateLeadSchema = z.object({
  stage: z.enum(["waiting", "interested", "refused", "closed", "production"]).optional(),
  email: z.union([z.email().max(254), z.literal("")]).optional(),
  note: z.string().trim().max(2000).optional(),
});
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const bulkLeadSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(500),
  stage: z.enum(["waiting", "interested", "refused", "closed", "production"]),
});
export type BulkLeadInput = z.infer<typeof bulkLeadSchema>;

export const upsertTemplateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  locale: z.enum(locales),
  body: z.string().trim().min(5).max(2000),
  variations: z.array(z.string().trim().min(5).max(2000)).max(10).default([]),
  active: z.boolean().default(true),
});
export type UpsertTemplateInput = z.infer<typeof upsertTemplateSchema>;

export const createCampaignSchema = z.object({
  name: z.string().trim().min(2).max(80),
  templateId: z.string().min(1).max(64),
  whatsappMode: z.enum(["cloud_api", "own_number"]),
  audience: z.object({
    stage: z.enum(["waiting", "interested", "refused", "closed", "production", "all"]).default("all"),
    temperature: z.enum(["hot", "warm", "cold", "all"]).default("all"),
    searchId: z.string().max(64).optional(),
    minHeat: z.number().int().min(0).max(100).optional(),
    onlyWithPhone: z.boolean().default(true),
  }),
  minDelaySec: z.number().int().min(15).max(3600).default(45),
  maxDelaySec: z.number().int().min(15).max(3600).default(120),
  dailyLimit: z.number().int().min(1).max(1000).default(200),
  startHour: z.number().int().min(0).max(23).default(8),
  endHour: z.number().int().min(0).max(23).default(20),
  warmupEnabled: z.boolean().default(true),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = z.object({
  status: z.enum(["draft", "scheduled", "running", "paused", "done", "cancelled"]).optional(),
  minDelaySec: z.number().int().min(15).max(3600).optional(),
  maxDelaySec: z.number().int().min(15).max(3600).optional(),
  dailyLimit: z.number().int().min(1).max(1000).optional(),
  startHour: z.number().int().min(0).max(23).optional(),
  endHour: z.number().int().min(0).max(23).optional(),
});
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const suppressionSchema = z.object({
  phoneE164: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Use o formato E.164, ex.: +5511999999999"),
  reason: z.enum(["opt_out", "bounce", "manual"]).default("manual"),
  note: z.string().trim().max(300).optional(),
});
export type SuppressionInput = z.infer<typeof suppressionSchema>;

export const manualActivationSchema = z.object({
  plan: z.enum(["trial", "starter", "pro", "business"]),
  credits: z.number().int().min(0).max(1_000_000),
  seats: z.number().int().min(1).max(100),
  note: z.string().trim().max(300).optional(),
});
export type ManualActivationInput = z.infer<typeof manualActivationSchema>;

export const webhookInSchema = z.object({
  url: z.string().url().max(500),
  events: z.array(z.enum(["lead.created", "lead.stage_changed", "search.completed", "campaign.reply"])).min(1).max(4),
});
export type WebhookInInput = z.infer<typeof webhookInSchema>;
