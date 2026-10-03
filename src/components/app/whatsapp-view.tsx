"use client";

/**
 * WhatsAppView (Fase 7) — três abas:
 *  • Campanhas: criação com audiência prévia, controles de janela/limite/
 *    aquecimento, processamento da fila (tick), modos cloud_api/own_number
 *    (com aviso de risco) e estatísticas da fila.
 *  • Templates: CRUD com variáveis {{nome}}/{{categoria}}/{{cidade}}/{{rating}},
 *    variações anti-spam e prévia.
 *  • Supressão: lista LGPD (opt-out "sair"/"parar", manual) com add/remove.
 */
import { AlertTriangle, Loader2, MessageSquareText, Pause, Play, Plus, RefreshCw, Send, Trash2, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useSession } from "@/components/app/session";
import { formatNumber, formatWhen } from "@/components/app/bits";
import { apiErrorCode, apiRequest, useApi } from "@/components/app/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { KANBAN_STAGES } from "@/shared/contracts";
import { toast } from "sonner";

/* ───────────────────────────── Campanhas ───────────────────────────── */

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  whatsappMode: string | null;
  templateName: string;
  minDelaySec: number;
  maxDelaySec: number;
  dailyLimit: number;
  startHour: number;
  endHour: number;
  warmupEnabled: boolean;
  createdAt: string;
  stats: Record<string, number>;
};

type CampaignsResponse = { campaigns: CampaignRow[] };
type TemplateRow = { id: string; name: string; body: string; variations: string[]; locale: string; active: boolean };

const CAMPAIGN_STATUS_TONES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  scheduled: "bg-[#0B5FFF]/10 text-[#0B5FFF] dark:text-[#6E97FF] border-[#0B5FFF]/30",
  running: "bg-[#12B886]/10 text-[#0E9F74] dark:text-[#4FD6AE] border-[#12B886]/30",
  paused: "bg-[#FF6B1A]/12 text-[#E2530A] dark:text-[#FF8F4D] border-[#FF6B1A]/30",
  done: "bg-[#12B886]/10 text-[#0E9F74] dark:text-[#4FD6AE] border-[#12B886]/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export function WhatsAppView() {
  const { session } = useSession();
  const canManage = session?.user.role === "owner" || session?.user.role === "admin";
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">
          <MessageSquareText className="mr-2 inline size-5 text-[#12B886]" aria-hidden />
          WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground">{useTranslationsSafe("subtitle")}</p>
      </div>
      <Tabs defaultValue="campaigns">
        <TabsList className="min-h-11">
          <TabsTrigger value="campaigns" className="min-h-9">{useTranslationsSafe("tabs.campaigns")}</TabsTrigger>
          <TabsTrigger value="templates" className="min-h-9">{useTranslationsSafe("tabs.templates")}</TabsTrigger>
          <TabsTrigger value="suppression" className="min-h-9">{useTranslationsSafe("tabs.suppression")}</TabsTrigger>
        </TabsList>
        <TabsContent value="campaigns" className="mt-4"><CampaignsSection canManage={canManage} /></TabsContent>
        <TabsContent value="templates" className="mt-4"><TemplatesSection canManage={canManage} /></TabsContent>
        <TabsContent value="suppression" className="mt-4"><SuppressionSection canManage={canManage} /></TabsContent>
      </Tabs>
    </div>
  );
}

function useTranslationsSafe(key: "subtitle" | "tabs.campaigns" | "tabs.templates" | "tabs.suppression"): string {
  const t = useTranslations("whatsapp");
  return t(key);
}

function CampaignsSection({ canManage }: { canManage: boolean }) {
  const t = useTranslations("whatsapp.campaigns");
  const tApi = useTranslations("apiErrors");
  const q = useApi<CampaignsResponse>("/api/campaigns");
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function control(campaign: CampaignRow, action: "start" | "pause" | "cancel" | "tick"): Promise<void> {
    setBusyId(campaign.id);
    try {
      if (action === "tick") {
        const res = await apiRequest<{ result: { sent: number; ready: number; skippedWindow: boolean; dailyLimitReached: boolean; done: boolean; provider: string } }>(`/api/campaigns/${campaign.id}`, { method: "POST" });
        const r = res.result;
        if (r.skippedWindow) toast.info(t("tickWindow"));
        else if (r.dailyLimitReached) toast.info(t("tickDailyLimit"));
        else toast.success(t("tickToast", { sent: r.sent, ready: r.ready }));
      } else {
        const status = action === "start" ? "running" : action === "pause" ? "paused" : "cancelled";
        await apiRequest(`/api/campaigns/${campaign.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
        toast.success(t("statusToast"));
      }
      void q.refetch();
    } catch (err) {
      toast.error(tApi(apiErrorCode(err)));
    } finally {
      setBusyId(null);
    }
  }

  const campaigns = q.data?.campaigns ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        {canManage && <Button className="min-h-11" onClick={() => setCreateOpen(true)}><Plus className="size-4" aria-hidden />{t("createCta")}</Button>}
      </div>
      {q.loading ? (
        <div className="flex flex-col gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : campaigns.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{t("empty")}</CardContent></Card>
      ) : (
        <div className="flex flex-col gap-3">
          {campaigns.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <Badge className={`border ${CAMPAIGN_STATUS_TONES[c.status] ?? ""}`} variant="outline">{c.status}</Badge>
                  <Badge variant="outline" className="text-[11px]">{c.whatsappMode === "own_number" ? t("modeOwn") : t("modeCloud")}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">{c.templateName}</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[11px] tabular-nums">{t("queued", { count: formatNumber(c.stats.queued ?? 0) })}</Badge>
                  <Badge variant="outline" className="text-[11px] tabular-nums">{t("sentCount", { count: formatNumber((c.stats.sent ?? 0) + (c.stats.delivered ?? 0) + (c.stats.read ?? 0) + (c.stats.replied ?? 0)) })}</Badge>
                  {(c.stats.failed ?? 0) > 0 && <Badge variant="outline" className="text-[11px] text-destructive border-destructive/30">{t("failedCount", { count: c.stats.failed })}</Badge>}
                  {(c.stats.opted_out ?? 0) > 0 && <Badge variant="outline" className="text-[11px]">{t("optedCount", { count: c.stats.opted_out })}</Badge>}
                  <Badge variant="outline" className="text-[11px] tabular-nums">{c.dailyLimit}/dia · {c.startHour}h–{c.endHour}h · {c.minDelaySec}–{c.maxDelaySec}s</Badge>
                </div>
                {canManage && ["draft", "scheduled", "running", "paused"].includes(c.status) && (
                  <div className="flex flex-wrap gap-2">
                    {c.status === "running" ? (
                      <Button size="sm" variant="outline" className="min-h-9" disabled={busyId === c.id} onClick={() => void control(c, "pause")}><Pause className="size-4" aria-hidden />{t("pause")}</Button>
                    ) : (
                      <Button size="sm" variant="outline" className="min-h-9" disabled={busyId === c.id} onClick={() => void control(c, "start")}><Play className="size-4" aria-hidden />{t("start")}</Button>
                    )}
                    <Button size="sm" variant="outline" className="min-h-9" disabled={busyId === c.id || c.status !== "running"} onClick={() => void control(c, "tick")}><Zap className="size-4" aria-hidden />{t("tick")}</Button>
                    <Button size="sm" variant="ghost" className="min-h-9 text-destructive hover:text-destructive" disabled={busyId === c.id} onClick={() => void control(c, "cancel")}>{t("cancel")}</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <CreateCampaignDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void q.refetch()} />
    </div>
  );
}

function CreateCampaignDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const t = useTranslations("whatsapp.campaigns.create");
  const tApi = useTranslations("apiErrors");
  const tStages = useTranslations("kanban.stages");
  const templatesQ = useApi<{ templates: TemplateRow[] }>("/api/templates");
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [mode, setMode] = useState<"cloud_api" | "own_number">("cloud_api");
  const [stage, setStage] = useState("all");
  const [temperature, setTemperature] = useState("all");
  const [minHeat, setMinHeat] = useState("");
  const [dailyLimit, setDailyLimit] = useState("200");
  const [startHour, setStartHour] = useState("8");
  const [endHour, setEndHour] = useState("20");
  const [preview, setPreview] = useState<{ total: number; eligible: number } | null>(null);
  const [working, setWorking] = useState(false);

  const activeTemplates = (templatesQ.data?.templates ?? []).filter((tp) => tp.active);

  async function runPreview(): Promise<void> {
    try {
      const res = await apiRequest<{ total: number; eligible: number }>("/api/campaigns/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience: {
            stage,
            temperature,
            ...(minHeat ? { minHeat: Number(minHeat) } : {}),
            onlyWithPhone: true,
          },
        }),
      });
      setPreview(res);
    } catch (err) {
      toast.error(tApi(apiErrorCode(err)));
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setWorking(true);
    try {
      const res = await apiRequest<{ queued: number }>("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          templateId,
          whatsappMode: mode,
          audience: { stage, temperature, ...(minHeat ? { minHeat: Number(minHeat) } : {}), onlyWithPhone: true },
          dailyLimit: Number(dailyLimit) || 200,
          startHour: Number(startHour) || 8,
          endHour: Number(endHour) || 20,
        }),
      });
      toast.success(t("toast", { count: res.queued }));
      onCreated();
      onOpenChange(false);
      setName("");
      setPreview(null);
    } catch (err) {
      toast.error(tApi(apiErrorCode(err)));
    } finally {
      setWorking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="camp-name">{t("name")}</Label>
            <Input id="camp-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("template")}</Label>
            <Select value={templateId} onValueChange={setTemplateId} required>
              <SelectTrigger className="min-h-11"><SelectValue placeholder={t("templatePlaceholder")} /></SelectTrigger>
              <SelectContent>
                {activeTemplates.map((tp) => (
                  <SelectItem key={tp.id} value={tp.id}>{tp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeTemplates.length === 0 && <p className="text-xs text-destructive">{t("noTemplates")}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("mode")}</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "cloud_api" | "own_number")}>
              <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cloud_api">{t("modeCloud")}</SelectItem>
                <SelectItem value="own_number">{t("modeOwn")}</SelectItem>
              </SelectContent>
            </Select>
            {mode === "own_number" && (
              <p className="flex items-start gap-1.5 rounded-md bg-[#FF6B1A]/10 p-2 text-xs text-[#E2530A] dark:text-[#FF8F4D]">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t("ownNumberWarning")}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("audienceStage")}</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("audienceAll")}</SelectItem>
                  {KANBAN_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>{tStages(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("audienceTemp")}</Label>
              <Select value={temperature} onValueChange={setTemperature}>
                <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("audienceAll")}</SelectItem>
                  <SelectItem value="hot">{t("audienceHot")}</SelectItem>
                  <SelectItem value="warm">{t("audienceWarm")}</SelectItem>
                  <SelectItem value="cold">{t("audienceCold")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="camp-heat">{t("minHeat")}</Label>
              <Input id="camp-heat" type="number" min={0} max={100} value={minHeat} onChange={(e) => setMinHeat(e.target.value)} placeholder="0" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="camp-limit">{t("dailyLimit")}</Label>
              <Input id="camp-limit" type="number" min={1} max={1000} value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("window")}</Label>
              <div className="flex items-center gap-1">
                <Input aria-label={t("startHour")} type="number" min={0} max={23} value={startHour} onChange={(e) => setStartHour(e.target.value)} />
                <span className="text-muted-foreground">–</span>
                <Input aria-label={t("endHour")} type="number" min={0} max={23} value={endHour} onChange={(e) => setEndHour(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" className="min-h-10" disabled={!templateId} onClick={() => void runPreview()}>
              <RefreshCw className="size-4" aria-hidden />
              {t("previewCta")}
            </Button>
            {preview && (
              <p className="text-sm tabular-nums">
                {t("previewResult", { eligible: formatNumber(preview.eligible), total: formatNumber(preview.total) })}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
            <Button type="submit" className="min-h-11" disabled={working || !templateId || name.trim().length < 2}>
              {working && <Loader2 className="size-4 animate-spin" aria-hidden />}
              <Send className="size-4" aria-hidden />
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── Templates ───────────────────────────── */

function TemplatesSection({ canManage }: { canManage: boolean }) {
  const t = useTranslations("whatsapp.templates");
  const tApi = useTranslations("apiErrors");
  const q = useApi<{ templates: TemplateRow[] }>("/api/templates");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null);

  async function remove(id: string): Promise<void> {
    try {
      await apiRequest(`/api/templates/${id}`, { method: "DELETE" });
      toast.success(t("deleteToast"));
      void q.refetch();
    } catch (err) {
      toast.error(tApi(apiErrorCode(err)));
    }
  }

  const templates = q.data?.templates ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        {canManage && <Button className="min-h-11" onClick={() => { setEditing(null); setEditOpen(true); }}><Plus className="size-4" aria-hidden />{t("create")}</Button>}
      </div>
      {q.loading ? (
        <div className="flex flex-col gap-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : templates.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{t("empty")}</CardContent></Card>
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map((tp) => (
            <Card key={tp.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{tp.name}</span>
                  <Badge variant="outline" className="text-[11px]">{tp.locale}</Badge>
                  {!tp.active && <Badge variant="outline" className="text-[11px] text-muted-foreground">{t("inactive")}</Badge>}
                  <div className="ml-auto flex gap-1.5">
                    {canManage && (
                      <>
                        <Button size="sm" variant="outline" className="min-h-9" onClick={() => { setEditing(tp); setEditOpen(true); }}>{t("edit")}</Button>
                        <Button size="sm" variant="ghost" className="min-h-9 text-destructive hover:text-destructive" onClick={() => void remove(tp.id)}><Trash2 className="size-4" aria-hidden /></Button>
                      </>
                    )}
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/50 p-2.5 text-sm">{tp.body}</p>
                {tp.variations.length > 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">{t("variationsCount", { count: tp.variations.length })}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <TemplateDialog open={editOpen} onOpenChange={setEditOpen} template={editing} onSaved={() => void q.refetch()} />
    </div>
  );
}

function TemplateDialog({ open, onOpenChange, template, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; template: TemplateRow | null; onSaved: () => void }) {
  const t = useTranslations("whatsapp.templates.dialog");
  const tApi = useTranslations("apiErrors");
  const tLeads = useTranslations("leads.temperature");
  const [name, setName] = useState("");
  const [locale, setLocale] = useState("pt-BR");
  const [body, setBody] = useState("");
  const [variations, setVariations] = useState("");
  const [active, setActive] = useState(true);
  const [working, setWorking] = useState(false);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  // Hidrata o form quando o template em edição muda (id "" = novo)
  const key = template?.id ?? "new";
  if (open && hydratedFor !== key) {
    setHydratedFor(key);
    setName(template?.name ?? "");
    setLocale(template?.locale ?? "pt-BR");
    setBody(template?.body ?? "");
    setVariations((template?.variations ?? []).join("\n"));
    setActive(template?.active ?? true);
  }

  const preview = body
    .replaceAll(/\{\{\s*nome\s*\}\}/gi, "Maria")
    .replaceAll(/\{\{\s*categoria\s*\}\}/gi, "Barbearia")
    .replaceAll(/\{\{\s*cidade\s*\}\}/gi, "Goiânia")
    .replaceAll(/\{\{\s*rating\s*\}\}/gi, "4,7");

  async function submit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setWorking(true);
    try {
      const payload = {
        name: name.trim(),
        locale,
        body: body.trim(),
        variations: variations.split("\n").map((v) => v.trim()).filter((v) => v.length >= 5).slice(0, 10),
        active,
      };
      if (template) {
        await apiRequest(`/api/templates/${template.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      } else {
        await apiRequest("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      }
      toast.success(t("toast"));
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(tApi(apiErrorCode(err)));
    } finally {
      setWorking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? t("editTitle") : t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-name">{t("name")}</Label>
              <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("locale")}</Label>
              <Select value={locale} onValueChange={setLocale}>
                <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">pt-BR</SelectItem>
                  <SelectItem value="en-US">en-US</SelectItem>
                  <SelectItem value="es-ES">es-ES</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-body">{t("body")}</Label>
            <Textarea id="tpl-body" value={body} onChange={(e) => setBody(e.target.value)} required minLength={5} maxLength={2000} className="min-h-24" />
            <p className="text-xs text-muted-foreground">{t("variablesHint")}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-vars">{t("variations")}</Label>
            <Textarea id="tpl-vars" value={variations} onChange={(e) => setVariations(e.target.value)} className="min-h-20" placeholder={t("variationsPlaceholder")} />
          </div>
          {body.trim().length >= 5 && (
            <div className="rounded-md border border-dashed p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t("preview")}</p>
              <p className="whitespace-pre-wrap text-sm">{preview}</p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label htmlFor="tpl-active">{t("active")}</Label>
            <Switch id="tpl-active" checked={active} onCheckedChange={setActive} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
            <Button type="submit" className="min-h-11" disabled={working}>
              {working && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── Supressão ───────────────────────────── */

type SuppressionRow = { id: string; phoneE164: string; reason: string; note: string | null; createdAt: string };

function SuppressionSection({ canManage }: { canManage: boolean }) {
  const t = useTranslations("whatsapp.suppression");
  const tApi = useTranslations("apiErrors");
  const q = useApi<{ entries: SuppressionRow[] }>("/api/suppression");
  const [phone, setPhone] = useState("");
  const [working, setWorking] = useState(false);

  async function add(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setWorking(true);
    try {
      await apiRequest("/api/suppression", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phoneE164: phone.trim(), reason: "manual" }) });
      toast.success(t("addToast"));
      setPhone("");
      void q.refetch();
    } catch (err) {
      toast.error(tApi(apiErrorCode(err)));
    } finally {
      setWorking(false);
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await apiRequest(`/api/suppression/${id}`, { method: "DELETE" });
      toast.success(t("removeToast"));
      void q.refetch();
    } catch (err) {
      toast.error(tApi(apiErrorCode(err)));
    }
  }

  const entries = q.data?.entries ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">{t("description")}</p>
          {canManage && (
            <form onSubmit={add} className="mt-3 flex gap-2">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+5511999999999" required pattern="\+[1-9][0-9]{7,14}" aria-label={t("phoneLabel")} className="min-h-11 max-w-xs font-mono" />
              <Button type="submit" variant="outline" className="min-h-11" disabled={working}>
                {working && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {t("add")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          {q.loading ? (
            <div className="flex flex-col gap-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
          ) : entries.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ScrollArea className="max-h-96">
              <div className="p-2">
                {entries.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent">
                    <span className="font-mono text-xs">{entry.phoneE164}</span>
                    <Badge variant="outline" className="text-[11px]">{entry.reason}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">{formatWhen(entry.createdAt, "")}</span>
                    {canManage && (
                      <Button size="sm" variant="ghost" className="min-h-8 px-1.5 text-destructive hover:text-destructive" aria-label={t("removeAria", { phone: entry.phoneE164 })} onClick={() => void remove(entry.id)}>
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
