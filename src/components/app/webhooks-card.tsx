"use client";

/**
 * WebhooksCard (Fase 8) — CRUD de webhooks de saída dentro de "Tokens & Conexão".
 * Eventos assinados com HMAC-SHA256; o segredo é exibido UMA única vez.
 * Mostra estatística de entregas (ok/failed) e permite reenvio.
 */
import { Plus, RefreshCw, Trash2, Webhook } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useSession } from "@/components/app/session";
import { useApi } from "@/components/app/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type WebhookRow = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  deliveries: Record<string, number>;
  createdAt: string;
};

const ALL_EVENTS = ["lead.created", "lead.stage_changed", "search.completed", "campaign.reply"] as const;
const EVENT_LABEL_KEYS: Record<string, "webhookEvent.leadCreated" | "webhookEvent.stageChanged" | "webhookEvent.searchCompleted" | "webhookEvent.campaignReply"> = {
  "lead.created": "webhookEvent.leadCreated",
  "lead.stage_changed": "webhookEvent.stageChanged",
  "search.completed": "webhookEvent.searchCompleted",
  "campaign.reply": "webhookEvent.campaignReply",
};

export function WebhooksCard() {
  const t = useTranslations("tokens.webhooks");
  const tApi = useTranslations("apiErrors");
  const { session } = useSession();
  const canManage = session?.user.role === "owner" || session?.user.role === "admin";
  const q = useApi<{ webhooks: WebhookRow[] }>("/api/webhooks");
  const [createOpen, setCreateOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["lead.created"]);
  const [working, setWorking] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  async function create(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setWorking(true);
    try {
      const res = await postJson<{ secret: string }>("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), events }),
      });
      setRevealed(res.secret);
      setCreateOpen(false);
      setUrl("");
      setEvents(["lead.created"]);
      void q.refetch();
      toast.success(t("createToast"));
    } catch {
      toast.error(tApi("internal_error", { message: "network" }));
    } finally {
      setWorking(false);
    }
  }

  async function toggleActive(hook: WebhookRow): Promise<void> {
    try {
      await postJson(`/api/webhooks/${hook.id}`, { method: "PATCH" });
      void q.refetch();
    } catch {
      toast.error(tApi("internal_error", { message: "network" }));
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await postJson(`/api/webhooks/${id}`, { method: "DELETE" });
      toast.success(t("deleteToast"));
      void q.refetch();
    } catch {
      toast.error(tApi("internal_error", { message: "network" }));
    }
  }

  async function resend(): Promise<void> {
    try {
      const res = await postJson<{ delivered: number }>("/api/webhooks/dispatch", { method: "POST" });
      toast.success(t("resendToast", { count: res.delivered }));
    } catch {
      toast.error(tApi("internal_error", { message: "network" }));
    }
  }

  const hooks = q.data?.webhooks ?? [];

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <Webhook className="size-4 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t("title")}</h2>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canManage && (
          <>
            <Button variant="ghost" size="sm" className="min-h-9" onClick={() => void resend()}>
              <RefreshCw className="size-3.5" aria-hidden />
              {t("resend")}
            </Button>
            <Button size="sm" className="min-h-9" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" aria-hidden />
              {t("create")}
            </Button>
          </>
        )}
      </div>
      {q.loading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ) : hooks.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y">
          {hooks.map((hook) => (
            <li key={hook.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs">{hook.url}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {hook.events.map((ev) => (
                    <Badge key={ev} variant="secondary" className="px-1.5 py-0 font-mono text-[10px]">
                      {t(EVENT_LABEL_KEYS[ev] ?? "webhookEvent.leadCreated")}
                    </Badge>
                  ))}
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px] tabular-nums">
                    ok: {hook.deliveries.ok ?? 0} · fail: {hook.deliveries.failed ?? 0}
                  </Badge>
                </div>
              </div>
              {canManage && (
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant={hook.active ? "outline" : "secondary"} className="min-h-9" onClick={() => void toggleActive(hook)}>
                    {hook.active ? t("active") : t("inactive")}
                  </Button>
                  <Button size="sm" variant="ghost" className="min-h-9 text-destructive hover:text-destructive" aria-label={t("deleteAria")} onClick={() => void remove(hook.id)}>
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Criação */}
      <Dialog open={createOpen || revealed !== null} onOpenChange={(open) => { if (!open) { setCreateOpen(false); setRevealed(null); } }}>
        <DialogContent className="max-w-md">
          {revealed ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("secretTitle")}</DialogTitle>
                <DialogDescription>{t("secretWarning")}</DialogDescription>
              </DialogHeader>
              <code className="block break-all rounded-lg bg-muted p-3 font-mono text-xs">{revealed}</code>
              <DialogFooter>
                <Button className="min-h-11" onClick={() => setRevealed(null)}>{t("secretDone")}</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t("createTitle")}</DialogTitle>
                <DialogDescription>{t("createDesc")}</DialogDescription>
              </DialogHeader>
              <form onSubmit={create} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="hook-url">{t("urlLabel")}</Label>
                  <Input id="hook-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://seu-crm.com/webhooks/pgs" required maxLength={500} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t("eventsLabel")}</Label>
                  {ALL_EVENTS.map((ev) => (
                    <label key={ev} className="flex min-h-9 items-center gap-2 text-sm">
                      <Checkbox
                        checked={events.includes(ev)}
                        onCheckedChange={(checked) => setEvents((prev) => (checked ? [...prev, ev] : prev.filter((v) => v !== ev)))}
                        aria-label={t(EVENT_LABEL_KEYS[ev])}
                      />
                      <code className="text-xs">{ev}</code>
                    </label>
                  ))}
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" className="min-h-11" onClick={() => setCreateOpen(false)}>{t("cancel")}</Button>
                  <Button type="submit" className="min-h-11" disabled={working || events.length === 0}>
                    {working && <RefreshCw className="size-4 animate-spin" aria-hidden />}
                    {t("submit")}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** fetch wrapper local com envelope padrão (evita import circular com use-api). */
async function postJson<T extends object>(path: string, init?: RequestInit): Promise<T & { ok: true }> {
  const res = await fetch(path, init);
  const json = (await res.json().catch(() => null)) as ({ ok: true } & T) | { ok: false; error: { code: string } } | null;
  if (!res.ok || !json || json.ok !== true) {
    throw new Error(json && "error" in json ? json.error.code : "internal_error");
  }
  return json;
}
