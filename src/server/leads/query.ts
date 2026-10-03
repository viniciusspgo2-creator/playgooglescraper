/**
 * Query builder de leads compartilhado pelas rotas de listagem, Kanban,
 * exportação e stats — fonte única dos filtros (Fase 5).
 */
import { tenantDb, type TenantClient } from "@/server/tenancy/tenant-guard";
import type { ListLeadsInput } from "@/shared/schemas";
import type { Prisma } from "@prisma/client";

export function buildLeadWhere(input: ListLeadsInput): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};
  if (input.q) {
    const q = input.q;
    where.OR = [
      { name: { contains: q } },
      { phoneE164: { contains: q } },
      { address: { contains: q } },
      { categoriesText: { contains: q } },
    ];
  }
  if (input.stage) where.stage = input.stage;
  if (input.temperature) where.temperature = input.temperature;
  if (input.hasSite === "true") where.hasSite = true;
  if (input.hasSite === "false") where.hasSite = false;
  if (input.minHeat !== undefined || input.maxHeat !== undefined) {
    where.heatScore = {
      ...(input.minHeat !== undefined ? { gte: input.minHeat } : {}),
      ...(input.maxHeat !== undefined ? { lte: input.maxHeat } : {}),
    };
  }
  if (input.searchId) where.searchId = input.searchId;
  if (input.category) where.categoriesText = { contains: input.category };
  return where;
}

export function buildLeadOrder(input: ListLeadsInput): Prisma.LeadOrderByWithRelationInput {
  const direction = input.dir === "asc" ? "asc" : "desc";
  switch (input.sort) {
    case "recent":
      return { createdAt: direction };
    case "rating":
      return { rating: direction };
    case "reviews":
      return { reviewsCount: direction };
    case "name":
      return { name: direction };
    case "heat":
    default:
      return { heatScore: direction };
  }
}

export function leadListItem(lead: Prisma.LeadGetPayload<{ select: LeadListSelect }>) {
  return {
    id: lead.id,
    placeId: lead.placeId,
    name: lead.name,
    phoneE164: lead.phoneE164,
    website: lead.website,
    websiteType: lead.websiteType,
    temperature: lead.temperature,
    hasSite: lead.hasSite,
    heatScore: lead.heatScore,
    stage: lead.stage,
    note: lead.note,
    primaryCategory: lead.primaryCategory,
    categoriesText: lead.categoriesText,
    rating: lead.rating,
    reviewsCount: lead.reviewsCount,
    address: lead.address,
    lat: lead.lat,
    lng: lead.lng,
    claimed: lead.claimed,
    sourceStrategy: lead.sourceStrategy,
    searchId: lead.searchId,
    createdAt: lead.createdAt.toISOString(),
    lastSeenAt: lead.lastSeenAt.toISOString(),
  };
}

export const LEAD_LIST_SELECT = {
  id: true,
  placeId: true,
  name: true,
  phoneE164: true,
  website: true,
  websiteType: true,
  temperature: true,
  hasSite: true,
  heatScore: true,
  stage: true,
  note: true,
  primaryCategory: true,
  categoriesText: true,
  rating: true,
  reviewsCount: true,
  address: true,
  lat: true,
  lng: true,
  claimed: true,
  sourceStrategy: true,
  searchId: true,
  createdAt: true,
  lastSeenAt: true,
} as const;

export type LeadListSelect = typeof LEAD_LIST_SELECT;

export function getTenantDb(tenantId: string): TenantClient {
  return tenantDb(tenantId);
}
