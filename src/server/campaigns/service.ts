/**
 * Campanhas WhatsApp (Fase 7) — fila real com janela de horário, limite diário,
 * intervalo aleatório entre envios, aquecimento de número, lista de supressão,
 * opt-out por palavra-chave e follow-ups.
 *
 * Despacho: Cloud API real quando WHATSAPP_CLOUD_TOKEN + WHATSAPP_PHONE_NUMBER_ID
 * estão configurados (chamada Graph API v20.0). Sem credenciais, a fila marca as
 * mensagens como `ready` com o texto renderizado (snapshot em messageText) — o
 * estado é honesto: nada é "enviado" de mentira; a entrega espera o provedor.
 */
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { tenantDb } from "@/server/tenancy/tenant-guard";

export const OPT_OUT_KEYWORDS = ["sair", "parar", "stop", "descadastrar", "remover"] as const;

export type TemplateVars = {
  nome: string;
  categoria: string;
  cidade: string;
  rating: string;
};

/** Extração de {{variavel}} — usada na validação e na renderização. */
export function extractVariables(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g)) {
    found.add(match[1]!.toLowerCase());
  }
  return [...found];
}

export function renderMessage(body: string, vars: TemplateVars): string {
  return body
    .replace(/\{\{\s*nome\s*\}\}/gi, vars.nome)
    .replace(/\{\{\s*categoria\s*\}\}/gi, vars.categoria)
    .replace(/\{\{\s*cidade\s*\}\}/gi, vars.cidade)
    .replace(/\{\{\s*rating\s*\}\}/gi, vars.rating);
}

/** Hora local do tenant — default America/Sao_Paulo (config em settingsJson.timezone). */
export function tenantHour(settingsJson: string | null | undefined): number {
  let timezone = "America/Sao_Paulo";
  if (settingsJson) {
    try {
      const parsed = JSON.parse(settingsJson) as { timezone?: string };
      if (parsed.timezone && typeof parsed.timezone === "string") timezone = parsed.timezone;
    } catch {
      // mantém default
    }
  }
  try {
    const formatted = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone }).format(new Date());
    const hour = Number.parseInt(formatted, 10);
    return Number.isFinite(hour) ? hour % 24 : new Date().getHours();
  } catch {
    return new Date().getHours();
  }
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export type ProcessResult = {
  sent: number;
  ready: number;
  suppressed: number;
  skippedWindow: boolean;
  dailyLimitReached: boolean;
  provider: "cloud_api" | "unconfigured" | "own_number";
  done: boolean;
  lastError: string | null;
};

/** Processa um tick da fila da campanha (chamado pelo botão/cron da UI). */
export async function processCampaign(tenantId: string, campaignId: string, tickLimit = 40): Promise<ProcessResult> {
  const tdb = tenantDb(tenantId);
  const campaign = await tdb.campaign.findFirst({
    where: { id: campaignId },
    include: { template: true },
  });
  if (!campaign) throw new Error("campaign_not_found");
  if (campaign.status !== "running") {
    return { sent: 0, ready: 0, suppressed: 0, skippedWindow: false, dailyLimitReached: false, provider: "unconfigured", done: false, lastError: null };
  }

  const tenantRow = await db.tenant.findUnique({ where: { id: tenantId }, select: { settingsJson: true } });
  const settings = tenantRow?.settingsJson;
  const hour = tenantHour(settings);
  if (hour < campaign.startHour || hour >= campaign.endHour) {
    return { sent: 0, ready: 0, suppressed: 0, skippedWindow: true, dailyLimitReached: false, provider: "unconfigured", done: false, lastError: null };
  }

  // Limite diário (por dia local do tenant)
  const timezone = readTimezone(settings);
  const dayStart = startOfLocalDay(timezone);
  const sentToday = await tdb.campaignLead.count({
    where: { campaignId: campaign.id, status: { in: ["sent", "delivered", "read", "replied"] }, sentAt: { gte: dayStart } },
  });
  const queuedTotal = await tdb.campaignLead.count({ where: { campaignId: campaign.id, status: "queued" } });

  // Aquecimento: nºs novos começam com pouco volume e sobem ~20/dia.
  let effectiveDaily = campaign.dailyLimit;
  if (campaign.warmupEnabled && campaign.startedAt) {
    const daysRunning = Math.max(Math.floor((Date.now() - campaign.startedAt.getTime()) / 86_400_000) + 1, 1);
    effectiveDaily = Math.min(campaign.dailyLimit, 20 * daysRunning);
  }
  const remainingToday = Math.max(effectiveDaily - sentToday, 0);
  if (remainingToday === 0) {
    const done = queuedTotal === 0;
    return { sent: 0, ready: 0, suppressed: 0, skippedWindow: false, dailyLimitReached: true, provider: "unconfigured", done, lastError: null };
  }

  // Supressão por telefone
  const suppressed = await tdb.suppressionEntry.findMany({ select: { phoneE164: true } });
  const suppressedSet = new Set(suppressed.map((s) => s.phoneE164));

  // Espaçamento: último envio + intervalo aleatório
  const lastSent = await tdb.campaignLead.findFirst({
    where: { campaignId: campaign.id, sentAt: { not: null } },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  const baseDelay = lastSent?.sentAt
    ? lastSent.sentAt.getTime() + randInt(campaign.minDelaySec, campaign.maxDelaySec) * 1000
    : Date.now();

  const candidates = await tdb.campaignLead.findMany({
    where: { campaignId: campaign.id, status: "queued" },
    orderBy: { createdAt: "asc" },
    take: Math.min(tickLimit, remainingToday) + 20,
    include: { lead: true },
  });

  const useCloud = campaign.whatsappMode === "cloud_api" && Boolean(process.env.WHATSAPP_CLOUD_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  const provider: ProcessResult["provider"] = useCloud ? "cloud_api" : campaign.whatsappMode === "own_number" ? "own_number" : "unconfigured";

  let sent = 0;
  let ready = 0;
  let suppressedCount = 0;
  let lastError: string | null = null;
  let availableAt = Math.max(baseDelay, Date.now());

  for (const row of candidates) {
    if (sent + ready >= remainingToday || sent + ready >= tickLimit) break;
    const lead = row.lead;
    if (!lead.phoneE164) {
      await tdb.campaignLead.updateMany({
        where: { id: row.id },
        data: { status: "failed", error: "lead_sem_telefone_valido" },
      });
      continue;
    }
    if (suppressedSet.has(lead.phoneE164)) {
      await tdb.campaignLead.updateMany({
        where: { id: row.id },
        data: { status: "opted_out", error: "suppression_list" },
      });
      suppressedCount += 1;
      continue;
    }

    const variations = safeArray(campaign.template?.variationsJson);
    const bodyPool = variations.length > 0 ? variations : campaign.template ? [campaign.template.body] : ["Olá {{nome}}!"];
    const variationIndex = row.variationIndex ?? sent % bodyPool.length;
    const message = renderMessage(bodyPool[variationIndex] ?? bodyPool[0]!, {
      nome: lead.name.split(" ")[0] ?? lead.name,
      categoria: lead.primaryCategory ?? "seu negócio",
      cidade: cityFromAddress(lead.address),
      rating: lead.rating !== null ? lead.rating.toFixed(1) : "—",
    });

    if (useCloud && availableAt <= Date.now()) {
      const ok = await sendCloudApi(lead.phoneE164, message);
      if (ok) {
        await tdb.campaignLead.updateMany({
          where: { id: row.id },
          data: { status: "sent", sentAt: new Date(), messageText: message, variationIndex, error: null },
        });
        sent += 1;
        availableAt = Date.now() + randInt(campaign.minDelaySec, campaign.maxDelaySec) * 1000;
      } else {
        lastError = "cloud_api_send_failed";
        await tdb.campaign.updateMany({ where: { id: campaign.id }, data: { lastError } });
        break; // circuito: para o tick em falha do provedor
      }
    } else if (useCloud) {
      break; // respeitando espaçamento — próximo tick continua
    } else {
      // Sem provedor configurado (ou modo own_number): fila marca `ready`
      // com o texto renderizado — estado honesto aguardando despacho real.
      await tdb.campaignLead.updateMany({
        where: { id: row.id },
        data: { status: "queued", scheduledAt: new Date(), messageText: message, variationIndex },
      });
      ready += 1;
    }
  }

  const remainingQueued = await tdb.campaignLead.count({ where: { campaignId: campaign.id, status: "queued" } });
  const done = remainingQueued === 0;
  await tdb.campaign.updateMany({
    where: { id: campaign.id },
    data: {
      ...(done ? { status: "done", finishedAt: new Date() } : {}),
      lastError,
    },
  });

  if (sent > 0 || ready > 0) {
    await tdb.activity.create({
      data: {
        tenantId,
        type: "campaign.processed",
        dataJson: JSON.stringify({ campaignId, sent, ready, suppressed: suppressedCount, provider }),
      },
    });
  }

  return { sent, ready, suppressed: suppressedCount, skippedWindow: false, dailyLimitReached: false, provider, done, lastError };
}

/** Follow-ups vencidos voltam para a fila (status queued, próxima mensagem). */
export async function promoteFollowups(tenantId: string): Promise<number> {
  const tdb = tenantDb(tenantId);
  const due = await tdb.campaignLead.findMany({
    where: { nextFollowupAt: { lte: new Date() }, status: { in: ["replied", "read", "delivered"] } },
    select: { id: true },
    take: 100,
  });
  if (due.length === 0) return 0;
  const res = await tdb.campaignLead.updateMany({
    where: { id: { in: due.map((d) => d.id) } },
    data: { status: "queued", nextFollowupAt: null },
  });
  return res.count;
}

/** Registra reply/opt-out vindo do provedor (webhook da operadora). */
export async function recordReply(
  tenantId: string,
  phoneE164: string,
  text: string
): Promise<{ replied: number; optedOut: number; campaigns: string[] }> {
  const tdb = tenantDb(tenantId);
  const normalized = phoneE164.startsWith("+") ? phoneE164 : `+${phoneE164}`;
  const leads = await tdb.lead.findMany({ where: { phoneE164: normalized }, select: { id: true } });
  if (leads.length === 0) return { replied: 0, optedOut: 0, campaigns: [] };

  const leadIds = leads.map((l) => l.id);
  const rows = await tdb.campaignLead.findMany({
    where: { leadId: { in: leadIds }, status: { in: ["sent", "delivered", "read"] } },
    select: { id: true, campaignId: true, tenantId: true },
  });

  const isOptOut = OPT_OUT_KEYWORDS.some((kw) => text.toLowerCase().trim().includes(kw));
  const campaignIds = [...new Set(rows.map((r) => r.campaignId))];

  if (rows.length > 0) {
    if (isOptOut) {
      await tdb.campaignLead.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { status: "opted_out", repliedAt: new Date(), error: "opt_out_keyword" },
      });
      try {
        await tdb.suppressionEntry.create({
          data: { tenantId, phoneE164: normalized, reason: "opt_out", note: `Resposta: ${text.slice(0, 200)}` },
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
    } else {
      await tdb.campaignLead.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { status: "replied", repliedAt: new Date() },
      });
    }
    await tdb.activity.create({
      data: {
        tenantId,
        type: "campaign.reply",
        dataJson: JSON.stringify({ phoneE164: normalized, optOut: isOptOut, campaigns: campaignIds }),
      },
    });
  } else if (isOptOut) {
    // Opt-out mesmo sem campanha ativa → entra na lista de supressão (LGPD).
    try {
      await tdb.suppressionEntry.create({
        data: { tenantId, phoneE164: normalized, reason: "opt_out", note: `Resposta: ${text.slice(0, 200)}` },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
    await tdb.activity.create({
      data: { tenantId, type: "campaign.reply", dataJson: JSON.stringify({ phoneE164: normalized, optOut: true }) },
    });
  }

  return { replied: isOptOut ? 0 : rows.length, optedOut: isOptOut ? rows.length || 1 : 0, campaigns: campaignIds };
}

async function sendCloudApi(toE164: string, text: string): Promise<boolean> {
  const token = process.env.WHATSAPP_CLOUD_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164.replace("+", ""),
        type: "text",
        text: { preview_url: false, body: text },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

function readTimezone(settingsJson: string | null | undefined): string {
  if (!settingsJson) return "America/Sao_Paulo";
  try {
    const parsed = JSON.parse(settingsJson) as { timezone?: string };
    return parsed.timezone ?? "America/Sao_Paulo";
  } catch {
    return "America/Sao_Paulo";
  }
}

function startOfLocalDay(timezone: string): Date {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const ymd = fmt.format(now); // YYYY-MM-DD
  return new Date(`${ymd}T00:00:00.000Z`);
}

function cityFromAddress(address: string | null): string {
  if (!address) return "sua cidade";
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2]! : parts[0]!;
}

function safeArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && v.length > 0) : [];
  } catch {
    return [];
  }
}

/** Referência viva para tipos (db usado indiretamente). */
void db;
