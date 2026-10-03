"use client";

/**
 * OverviewView (Fase 5) — dashboard ao vivo com dados reais do tenant:
 * totais, distribuição de temperatura, série diária (14d), etapas, telemetria
 * de estratégia, buscas ativas e atividades recentes. Polling de 15s.
 */
import { BarChart3, Boxes, MapPinned, Search, ThermometerSun, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis } from "recharts";
import { useEffect, useState } from "react";

import { useSession } from "@/components/app/session";
import { formatNumber, formatWhen } from "@/components/app/bits";
import { useApi } from "@/components/app/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Overview = {
  totals: { leads: number; leads24h: number; members: number; hot: number; warm: number; cold: number };
  byStage: Record<string, number>;
  byStrategy: Record<string, number>;
  byDay: Array<{ date: string; count: number }>;
  topCategories: Array<{ category: string; count: number }>;
  activeSearches: Array<{ id: string; term: string; status: string; cellsTotal: number; cellsDone: number; createdAt: string }>;
  credits: { limit: number; used: number; remaining: number };
  activities: Array<{ id: string; type: string; data: Record<string, unknown> | null; userId: string | null; createdAt: string }>;
};

const STAGE_COLORS: Record<string, string> = {
  waiting: "#9AA7B8",
  interested: "#0B5FFF",
  refused: "#E03131",
  closed: "#12B886",
  production: "#FF6B1A",
};

const TEMP_COLORS = ["#FF6B1A", "#0B5FFF", "#9AA7B8"];

export function OverviewView({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const t = useTranslations("workspace.overview");
  const tStages = useTranslations("kanban.stages");
  const { session } = useSession();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function load(): Promise<void> {
      try {
        const res = await fetch("/api/stats/overview", { signal: controller.signal, headers: { Accept: "application/json" } });
        const json = (await res.json().catch(() => null)) as ({ ok: true } & Overview) | null;
        if (cancelled) return;
        if (json && json.ok) {
          setOverview(json);
          setError(false);
        } else {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const interval = window.setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || !overview) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">{t("loadError")}</CardContent>
      </Card>
    );
  }

  const tempData = [
    { name: "hot", value: overview.totals.hot },
    { name: "warm", value: overview.totals.warm },
    { name: "cold", value: overview.totals.cold },
  ].filter((d) => d.value > 0);
  const totalTemp = tempData.reduce((acc, d) => acc + d.value, 0);
  const stageData = Object.entries(overview.byStage).map(([stage, count]) => ({ stage, count }));
  const creditPct = overview.credits.limit > 0 ? Math.min((overview.credits.remaining / overview.credits.limit) * 100, 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle", { name: session?.user.name?.split(" ")[0] ?? "" })}</p>
      </div>

      {/* Cards de totais */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label={t("cards.leads")} value={formatNumber(overview.totals.leads)} hint={t("cards.leads24h", { count: overview.totals.leads24h })} onClick={() => onNavigate("leads")} />
        <StatCard icon={ThermometerSun} label={t("cards.hot")} value={formatNumber(overview.totals.hot)} hint={t("cards.tempShare", { pct: totalTemp > 0 ? Math.round((overview.totals.hot / totalTemp) * 100) : 0 })} tone="hot" onClick={() => onNavigate("leads")} />
        <StatCard icon={Search} label={t("cards.searches")} value={formatNumber(overview.activeSearches.length)} hint={t("cards.searchesHint")} onClick={() => onNavigate("searches")} />
        <StatCard icon={Boxes} label={t("cards.credits")} value={formatNumber(overview.credits.remaining)} hint={t("cards.creditsHint", { used: formatNumber(overview.credits.used), limit: formatNumber(overview.credits.limit) })} onClick={() => onNavigate("billing")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Série diária */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("charts.byDay")}</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={overview.byDay} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF6B1A" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#0B5FFF" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <ReTooltip />
                <Area type="monotone" dataKey="count" stroke="#FF6B1A" strokeWidth={2} fill="url(#leadsGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Temperatura */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("charts.temperature")}</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {totalTemp === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t("empty")}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={tempData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                    {tempData.map((entry, i) => (
                      <Cell key={entry.name} fill={TEMP_COLORS[i % TEMP_COLORS.length]} />
                    ))}
                  </Pie>
                  <ReTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="mt-1 flex justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#FF6B1A]" />{t("temp.hot")}</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#0B5FFF]" />{t("temp.warm")}</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#9AA7B8]" />{t("temp.cold")}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Etapas */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("charts.stages")}</CardTitle>
          </CardHeader>
          <CardContent className="h-52">
            {stageData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t("empty")}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="stage" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <ReTooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {stageData.map((d) => (
                      <Cell key={d.stage} fill={STAGE_COLORS[d.stage] ?? "#9AA7B8"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {stageData.map((d) => (
                <Badge key={d.stage} variant="outline" className="gap-1.5 text-[11px]">
                  <span className="size-2 rounded-full" style={{ background: STAGE_COLORS[d.stage] }} />
                  {tStages(d.stage as "waiting")}: {formatNumber(d.count)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Estratégia + categorias */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("charts.strategy")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Object.entries(overview.byStrategy).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              Object.entries(overview.byStrategy).map(([strategy, count]) => (
                <div key={strategy} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", strategy === "payload" ? "bg-[#12B886]" : strategy === "dom" ? "bg-[#0B5FFF]" : "bg-[#FF6B1A]")} />
                    {strategyLabel(strategy, t)}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{formatNumber(count)}</span>
                </div>
              ))
            )}
            <div className="mt-1 border-t pt-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><BarChart3 className="size-3.5" />{t("charts.topCategories")}</p>
              {overview.topCategories.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("empty")}</p>
              ) : (
                overview.topCategories.map((c) => (
                  <div key={c.category} className="flex items-center justify-between py-0.5 text-sm">
                    <span className="truncate">{c.category}</span>
                    <span className="tabular-nums text-muted-foreground">{formatNumber(c.count)}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Buscas ativas + créditos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><MapPinned className="size-3.5" />{t("charts.activeSearches")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {overview.activeSearches.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">{t("noSearches")}</p>
            ) : (
              overview.activeSearches.map((s) => {
                const pct = s.cellsTotal > 0 ? Math.round((s.cellsDone / s.cellsTotal) * 100) : 0;
                return (
                  <button key={s.id} type="button" onClick={() => onNavigate("searches")} className="rounded-lg border p-3 text-left transition-colors hover:bg-accent">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{s.term}</span>
                      <span className="text-xs text-muted-foreground">{s.status}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={pct} className="h-1.5" aria-label={t("charts.activeSearches")} />
                      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{s.cellsDone}/{s.cellsTotal}</span>
                    </div>
                  </button>
                );
              })
            )}
            <div className="border-t pt-3">
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("creditsRemaining", { remaining: formatNumber(overview.credits.remaining), limit: formatNumber(overview.credits.limit) })}</span>
                <span className="tabular-nums">{creditPct.toFixed(0)}%</span>
              </div>
              <Progress value={creditPct} className="h-1.5" aria-label={t("cards.credits")} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Atividade recente */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t("recentActivity")}</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onNavigate("audit")}>{t("seeAll")}</Button>
        </CardHeader>
        <CardContent>
          {overview.activities.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {overview.activities.map((a) => (
                <li key={a.id} className="flex items-center gap-3 text-sm">
                  <ActivityDot type={a.type} />
                  <span className="font-medium">{activityLabel(a.type, t, tStages)}</span>
                  <span className="truncate text-muted-foreground">{activityDetail(a)}</span>
                  <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{formatWhen(a.createdAt, "")}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, tone, onClick }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone?: "hot";
  onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="text-left outline-none transition-transform focus-visible:outline-2 focus-visible:outline-primary hover:-translate-y-0.5">
      <Card className="h-full">
        <CardContent className="flex items-start gap-3 p-4">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tone === "hot" ? "bg-[#FF6B1A]/12 text-[#E2530A] dark:text-[#FF8F4D]" : "bg-primary/10 text-primary")}>
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
            <p className="font-display text-2xl font-semibold tabular-nums leading-tight">{value}</p>
            <p className="truncate text-xs text-muted-foreground">{hint}</p>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function ActivityDot({ type }: { type: string }) {
  const cls = type.startsWith("lead.")
    ? "bg-[#0B5FFF]"
    : type.startsWith("search.")
      ? "bg-[#12B886]"
      : type.startsWith("campaign.")
        ? "bg-[#FF6B1A]"
        : "bg-[#9AA7B8]";
  return <span className={cn("size-2 shrink-0 rounded-full", cls)} aria-hidden />;
}

type TransFn = ReturnType<typeof useTranslations>;

const STRATEGY_KEYS: Record<string, "strategyPayload" | "strategyDom" | "strategyDetail"> = {
  payload: "strategyPayload",
  dom: "strategyDom",
  detail: "strategyDetail",
};

function strategyLabel(strategy: string, t: TransFn): string {
  const key = STRATEGY_KEYS[strategy];
  return key ? t(key) : strategy;
}

const ACTIVITY_KEYS: Record<string, string> = {
  "auth.register": "activityAuthRegister",
  "auth.login": "activityAuthLogin",
  "token.created": "activityTokenCreated",
  "token.revoked": "activityTokenRevoked",
  "leads.batch_ingested": "activityLeadsIngested",
  "leads.exported": "activityLeadsExported",
  "lead.stage_changed": "activityLeadStage",
  "lead.deleted": "activityLeadDeleted",
  "search.created": "activitySearchCreated",
  "search.started": "activitySearchStarted",
  "search.completed": "activitySearchCompleted",
  "search.claimed": "activitySearchClaimed",
  "search.status_changed": "activitySearchStatus",
  "search.deleted": "activitySearchDeleted",
  "campaign.created": "activityCampaignCreated",
  "campaign.status_changed": "activityCampaignStatus",
  "campaign.processed": "activityCampaignProcessed",
  "campaign.reply": "activityCampaignReply",
  "template.created": "activityTemplateCreated",
  "suppression.added": "activitySuppressionAdded",
  "suppression.removed": "activitySuppressionRemoved",
  "webhook.created": "activityWebhookCreated",
  "webhook.deleted": "activityWebhookDeleted",
  "billing.plan_applied": "activityBillingApplied",
  "member.invited": "activityMemberInvited",
  "member.disabled": "activityMemberDisabled",
};

function activityLabel(type: string, t: TransFn, _tStages: TransFn): string {
  const key = ACTIVITY_KEYS[type];
  return key ? t(key as "activityAuthLogin") : type;
}

function activityDetail(a: { data: Record<string, unknown> | null }): string {
  if (!a.data) return "";
  const name = typeof a.data.name === "string" ? a.data.name : null;
  const term = typeof a.data.term === "string" ? a.data.term : null;
  const created = typeof a.data.created === "number" ? a.data.created : null;
  const parts: string[] = [];
  if (name) parts.push(name);
  if (term) parts.push(term);
  if (created !== null) parts.push(`+${created}`);
  return parts.join(" · ");
}
