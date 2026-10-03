/**
 * Webhooks de saída (API pública) — eventos assinados com HMAC-SHA256.
 * Enfileirar é síncrono e barato (createMany); a entrega HTTP é assíncrona
 * (fire-and-forget) com retry persistido em WebhookDelivery.
 */
import { createHmac } from "node:crypto";

import { db } from "@/lib/db";
import { tenantDb } from "@/server/tenancy/tenant-guard";

export const WEBHOOK_EVENTS = ["lead.created", "lead.stage_changed", "search.completed", "campaign.reply"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const DELIVERY_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 5;

function sign(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** Enfileira entregas para todos os webhooks ativos subscritos ao evento. */
export async function enqueueDeliveries(
  tenantId: string,
  events: Array<{ event: string; payload: Record<string, unknown> }>
): Promise<number> {
  if (events.length === 0) return 0;
  const tdb = tenantDb(tenantId);
  const webhooks = await tdb.webhook.findMany({ where: { active: true } });
  if (webhooks.length === 0) return 0;

  const rows: Array<{
    tenantId: string;
    webhookId: string;
    event: string;
    payloadJson: string;
    nextRetryAt: Date;
  }> = [];
  for (const { event, payload } of events) {
    for (const hook of webhooks) {
      const subscribed = safeEvents(hook.eventsJson);
      if (subscribed.length > 0 && !subscribed.includes(event)) continue;
      rows.push({
        tenantId,
        webhookId: hook.id,
        event,
        payloadJson: JSON.stringify({ event, data: payload, created_at: new Date().toISOString() }),
        nextRetryAt: new Date(),
      });
    }
  }
  if (rows.length === 0) return 0;
  const res = await tdb.webhookDelivery.createMany({ data: rows });
  // Entrega assíncrona — nunca bloqueia a ingestão.
  void dispatchPendingDeliveries(tenantId);
  return res.count;
}

function safeEvents(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Tenta entregar pendências do tenant (chamado async após ingestão e pelo endpoint de retry). */
export async function dispatchPendingDeliveries(tenantId: string): Promise<number> {
  const tdb = tenantDb(tenantId);
  const pending = await tdb.webhookDelivery.findMany({
    where: { status: { in: ["pending", "failed"] }, nextRetryAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  let delivered = 0;
  for (const delivery of pending) {
    const hook = await tdb.webhook.findFirst({ where: { id: delivery.webhookId } });
    if (!hook || !hook.active) {
      await tdb.webhookDelivery.updateMany({
        where: { id: delivery.id },
        data: { status: "failed", lastAttemptAt: new Date() },
      });
      continue;
    }
    const body = delivery.payloadJson;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
      const res = await fetch(hook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PGS-Event": delivery.event,
          "X-PGS-Signature": `t=${timestamp},v1=${sign(hook.secret, timestamp, body)}`,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const ok = res.status >= 200 && res.status < 300;
      await tdb.webhookDelivery.updateMany({
        where: { id: delivery.id },
        data: {
          status: ok ? "ok" : "failed",
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          responseCode: res.status,
          ...(ok ? {} : { nextRetryAt: nextRetry(delivery.attempts + 1) }),
        },
      });
      if (ok) delivered += 1;
    } catch {
      const attempts = delivery.attempts + 1;
      await tdb.webhookDelivery.updateMany({
        where: { id: delivery.id },
        data: {
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          nextRetryAt: nextRetry(attempts),
        },
      });
    }
  }
  return delivered;
}

function nextRetry(attempt: number): Date {
  // Backoff exponencial: 30s, 2min, 8min, 30min (mesma curva do circuit breaker).
  const delaysSec = [30, 120, 480, 1800, 1800];
  const delay = delaysSec[Math.min(attempt, delaysSec.length) - 1] ?? 1800;
  return new Date(Date.now() + delay * 1000);
}
