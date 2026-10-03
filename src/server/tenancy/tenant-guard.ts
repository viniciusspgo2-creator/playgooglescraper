/**
 * TenantGuard — RLS de aplicação sobre Prisma (ADR-003 §D3).
 *
 * `tenantDb(tenantId)` devolve um cliente Prisma estendido que garante, para
 * todo modelo tenant-scoped, que nenhuma query leia ou escreva fora do tenant:
 *
 *  - create/createMany: injeta `tenantId` e REJEITA payload com tenantId divergente.
 *  - findFirst/findMany/count/aggregate/groupBy/updateMany/deleteMany:
 *    força `tenantId` no where via `AND` composto.
 *  - findUnique/findUniqueOrThrow/update/delete/upsert: PROIBIDOS (where único
 *    não aceita filtro de tenant → bypass clássico). Os serviços usam
 *    findFirst({id}) + updateMany/deleteMany com tenantId.
 *
 * Política: `$queryRaw` é proibido em tabelas tenant-scoped (não passa pelo
 * guard) — verificado em code review e coberto pela auditoria de API
 * (`bun run verify:isolation`).
 */
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

/** Modelos que POSSUEM tenantId — qualquer modelo novo precisa entrar aqui. */
export const TENANT_SCOPED_MODELS = [
  "User",
  "ApiToken",
  "Search",
  "SearchCell",
  "Lead",
  "Template",
  "Campaign",
  "CampaignLead",
  "Creative",
  "Activity",
  "Webhook",
  "WebhookDelivery",
  "SuppressionEntry",
  "BillingEvent",
] as const;

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

export class TenantScopeError extends Error {
  constructor(message = "Operação fora do escopo do tenant bloqueada pelo TenantGuard") {
    super(message);
    this.name = "TenantScopeError";
  }
}

function isTenantScoped(model: string): model is TenantScopedModel {
  return (TENANT_SCOPED_MODELS as readonly string[]).includes(model);
}

function requireSameTenant(incoming: unknown, tenantId: string): void {
  if (incoming !== undefined && incoming !== null && incoming !== tenantId) {
    throw new TenantScopeError();
  }
}

function injectWhere(
  args: { where?: { tenantId?: unknown } & Record<string, unknown> },
  tenantId: string
): void {
  const existing = args.where ?? {};
  requireSameTenant(existing.tenantId, tenantId);
   
  args.where = { AND: [existing as any, { tenantId }] } as never;
}

export type TenantClient = {
  user: Prisma.UserDelegate;
  apiToken: Prisma.ApiTokenDelegate;
  search: Prisma.SearchDelegate;
  searchCell: Prisma.SearchCellDelegate;
  lead: Prisma.LeadDelegate;
  template: Prisma.TemplateDelegate;
  campaign: Prisma.CampaignDelegate;
  campaignLead: Prisma.CampaignLeadDelegate;
  creative: Prisma.CreativeDelegate;
  activity: Prisma.ActivityDelegate;
  webhook: Prisma.WebhookDelegate;
  webhookDelivery: Prisma.WebhookDeliveryDelegate;
  suppressionEntry: Prisma.SuppressionEntryDelegate;
  billingEvent: Prisma.BillingEventDelegate;
};

function createTenantDb(tenantId: string): TenantClient {
  if (!tenantId || typeof tenantId !== "string") {
    throw new TenantScopeError("tenantDb exige um tenantId não vazio");
  }
  return db.$extends({
    name: "tenantGuard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !isTenantScoped(model)) {
            return query(args);
          }
           
          const a = (args ?? {}) as any;
          switch (operation) {
            case "create": {
              requireSameTenant(a.data?.tenantId, tenantId);
              a.data = { ...a.data, tenantId };
              break;
            }
            case "createMany": {
              if (Array.isArray(a.data)) {
                for (const row of a.data) {
                  requireSameTenant(row?.tenantId, tenantId);
                  row.tenantId = tenantId;
                }
              } else {
                requireSameTenant(a.data?.tenantId, tenantId);
                a.data = { ...a.data, tenantId };
              }
              break;
            }
            case "findFirst":
            case "findFirstOrThrow":
            case "findMany":
            case "count":
            case "aggregate":
            case "groupBy":
            case "updateMany":
            case "deleteMany": {
              injectWhere(a, tenantId);
              break;
            }
            case "findUnique":
            case "findUniqueOrThrow":
            case "update":
            case "delete":
            case "upsert": {
              throw new TenantScopeError(
                `"${operation}" em ${model} é proibido pelo TenantGuard: use findFirst({id}) + updateMany/deleteMany com tenant_id no where.`
              );
            }
            default:
              break;
          }
          return query(a);
        },
      },
    },
  }) as unknown as TenantClient;
}

/** Cache por tenant — evita recriar a extensão a cada request. */
const tenantDbCache = new Map<string, TenantClient>();
const MAX_CACHED_TENANT_CLIENTS = 200;

export function tenantDb(tenantId: string): TenantClient {
  const cached = tenantDbCache.get(tenantId);
  if (cached) return cached;
  if (tenantDbCache.size > MAX_CACHED_TENANT_CLIENTS) tenantDbCache.clear();
  const client = createTenantDb(tenantId);
  tenantDbCache.set(tenantId, client);
  return client;
}
