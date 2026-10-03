"use client";

/**
 * LeadsView (Fase 5) — tabela server-paginada (aguenta 50k+) com filtros,
 * ações em massa, exportação CSV e drawer de detalhe com telemetria.
 */
import { Download, Loader2, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { useSession } from "@/components/app/session";
import { HeatBar, StageBadge, TemperatureBadge, formatNumber, formatWhen } from "@/components/app/bits";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KANBAN_STAGES } from "@/shared/contracts";
import { toast } from "sonner";

type LeadRow = {
  id: string;
  placeId: string;
  name: string;
  phoneE164: string | null;
  website: string | null;
  websiteType: string;
  temperature: string;
  hasSite: boolean;
  heatScore: number;
  stage: string;
  primaryCategory: string | null;
  rating: number | null;
  reviewsCount: number | null;
  address: string | null;
  searchId: string | null;
  createdAt: string;
};

type LeadsResponse = {
  leads: LeadRow[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
  aggregates: { byTemperature: Record<string, number>; byStage: Record<string, number> };
};

type SearchRow = { id: string; term: string; status: string };

const NO_SITE_FILTERS = ["any", "false", "true"] as const;
const TEMP_FILTERS = ["any", "hot", "warm", "cold"] as const;

export function LeadsView() {
  const t = useTranslations("leads");
  const tApi = useTranslations("apiErrors");
  const tStages = useTranslations("kanban.stages");
  const { session } = useSession();
  const canDelete = session?.user.role === "owner" || session?.user.role === "admin";

  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [stage, setStage] = useState("any");
  const [temperature, setTemperature] = useState("any");
  const [hasSite, setHasSite] = useState<(typeof NO_SITE_FILTERS)[number]>("any");
  const [searchId, setSearchId] = useState("any");
  const [sort, setSort] = useState("heat");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Pick<LeadRow, "id" | "name"> | null>(null);
  const [working, setWorking] = useState(false);

  const searchesQ = useApi<{ searches: SearchRow[] }>("/api/searches");

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), perPage: "25", sort });
    if (appliedQ) params.set("q", appliedQ);
    if (stage !== "any") params.set("stage", stage);
    if (temperature !== "any") params.set("temperature", temperature);
    if (hasSite !== "any") params.set("hasSite", hasSite);
    if (searchId !== "any") params.set("searchId", searchId);
    return params.toString();
  }, [appliedQ, stage, temperature, hasSite, searchId, sort, page]);

  const q2 = useApi<LeadsResponse>(`/api/leads?${query}`);
  const leads = q2.data?.leads ?? [];
  const pagination = q2.data?.pagination;

  function resetToFirstPage(): void {
    setPage(1);
  }

  async function setStageBulk(nextStage: string): Promise<void> {
    if (selected.size === 0) return;
    setWorking(true);
    try {
      await apiRequest("/api/leads/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], stage: nextStage }),
      });
      toast.success(t("bulkToast", { count: selected.size }));
      setSelected(new Set());
      void q2.refetch();
    } catch (err) {
      toast.error(tApi(apiErrorCode(err)));
    } finally {
      setWorking(false);
    }
  }

  async function deleteLead(lead: Pick<LeadRow, "id" | "name">): Promise<void> {
    setWorking(true);
    try {
      await apiRequest(`/api/leads/${lead.id}`, { method: "DELETE" });
      toast.success(t("deleteToast"));
      setConfirmDelete(null);
      setSelected(new Set());
      void q2.refetch();
    } catch (err) {
      toast.error(tApi(apiErrorCode(err)));
    } finally {
      setWorking(false);
    }
  }

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(): void {
    setSelected((prev) => (prev.size === leads.length ? new Set() : new Set(leads.map((l) => l.id))));
  }

  const allSelected = leads.length > 0 && selected.size === leads.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{pagination ? t("subtitle", { count: formatNumber(pagination.total) }) : ""}</p>
        </div>
        <a href={`/api/leads/export?${query}`} download>
          <Button variant="outline" className="min-h-11">
            <Download className="size-4" aria-hidden />
            {t("export")}
          </Button>
        </a>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
          <form
            className="relative xl:col-span-2"
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedQ(q.trim());
              resetToFirstPage();
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("filters.q")} className="min-h-11 pl-9" aria-label={t("filters.q")} />
          </form>
          <Select value={stage} onValueChange={(v) => { setStage(v); resetToFirstPage(); }}>
            <SelectTrigger className="min-h-11" aria-label={t("filters.stage")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t("filters.allStages")}</SelectItem>
              {KANBAN_STAGES.map((s) => (
                <SelectItem key={s} value={s}>{tStages(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={temperature} onValueChange={(v) => { setTemperature(v); resetToFirstPage(); }}>
            <SelectTrigger className="min-h-11" aria-label={t("filters.temperature")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {TEMP_FILTERS.map((v) => (
                <SelectItem key={v} value={v}>{v === "any" ? t("filters.allTemps") : t(`temperature.${v}` as "temperature.hot")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={hasSite} onValueChange={(v) => { setHasSite(v as (typeof NO_SITE_FILTERS)[number]); resetToFirstPage(); }}>
            <SelectTrigger className="min-h-11" aria-label={t("filters.hasSite")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {NO_SITE_FILTERS.map((v) => (
                <SelectItem key={v} value={v}>{v === "any" ? t("filters.anySite") : v === "false" ? t("filters.noSite") : t("filters.withSite")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={searchId} onValueChange={(v) => { setSearchId(v); resetToFirstPage(); }}>
            <SelectTrigger className="min-h-11" aria-label={t("filters.search")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t("filters.allSearches")}</SelectItem>
              {(searchesQ.data?.searches ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.term}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => { setSort(v); resetToFirstPage(); }}>
            <SelectTrigger className="min-h-11" aria-label={t("filters.sort")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="heat">{t("sort.heat")}</SelectItem>
              <SelectItem value="recent">{t("sort.recent")}</SelectItem>
              <SelectItem value="rating">{t("sort.rating")}</SelectItem>
              <SelectItem value="reviews">{t("sort.reviews")}</SelectItem>
              <SelectItem value="name">{t("sort.name")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Ações em massa */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 p-3">
          <span className="text-sm font-medium">{t("bulkSelected", { count: selected.size })}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {KANBAN_STAGES.map((s) => (
              <Button key={s} size="sm" variant="outline" className="min-h-9" disabled={working} onClick={() => void setStageBulk(s)}>
                {tStages(s)}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {q2.loading ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : leads.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-10">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={t("selectAll")} className="size-4" />
                    </TableHead>
                    <TableHead>{t("col.name")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("col.phone")}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t("col.site")}</TableHead>
                    <TableHead>{t("col.temp")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("col.heat")}</TableHead>
                    <TableHead>{t("col.stage")}</TableHead>
                    <TableHead className="hidden xl:table-cell">{t("col.rating")}</TableHead>
                    <TableHead className="hidden xl:table-cell">{t("col.category")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id} className="cursor-pointer" onClick={() => setDetailId(lead.id)}>
                      <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggle(lead.id)} aria-label={t("selectRow", { name: lead.name })} className="size-4" />
                      </TableCell>
                      <TableCell className="max-w-52">
                        <p className="truncate font-medium">{lead.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{formatWhen(lead.createdAt, "")}</p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-xs tabular-nums">{lead.phoneE164 ?? "—"}</TableCell>
                      <TableCell className="hidden max-w-40 lg:table-cell">
                        {lead.website ? <span className="block truncate text-xs">{lead.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span> : <Badge variant="outline" className="text-[11px] text-[#E2530A] dark:text-[#FF8F4D]">{t("noSite")}</Badge>}
                      </TableCell>
                      <TableCell><TemperatureBadge temperature={lead.temperature} /></TableCell>
                      <TableCell className="hidden sm:table-cell"><HeatBar score={lead.heatScore} /></TableCell>
                      <TableCell><StageBadge stage={lead.stage} /></TableCell>
                      <TableCell className="hidden xl:table-cell text-sm tabular-nums">{lead.rating !== null ? `${lead.rating.toFixed(1)} (${formatNumber(lead.reviewsCount ?? 0)})` : "—"}</TableCell>
                      <TableCell className="hidden max-w-36 xl:table-cell"><span className="block truncate text-xs text-muted-foreground">{lead.primaryCategory ?? "—"}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" className="min-h-10" disabled={page <= 1} onClick={() => setPage((p) => Math.max(p - 1, 1))}>{t("prevPage")}</Button>
          <span className="text-sm tabular-nums text-muted-foreground">{t("pageOf", { page: pagination.page, total: pagination.totalPages })}</span>
          <Button variant="outline" size="sm" className="min-h-10" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}>{t("nextPage")}</Button>
        </div>
      )}

      {/* Detalhe */}
      <LeadDetailDialog leadId={detailId} onClose={() => setDetailId(null)} canDelete={canDelete} working={working} onDelete={(lead) => setConfirmDelete(lead)} onChanged={() => void q2.refetch()} />

      {/* Confirmação de exclusão */}
      <Dialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDescription", { name: confirmDelete?.name ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" className="min-h-11" onClick={() => setConfirmDelete(null)}>{t("cancelDelete")}</Button>
            <Button variant="destructive" className="min-h-11" disabled={working} onClick={() => confirmDelete && void deleteLead(confirmDelete)}>
              <Trash2 className="size-4" aria-hidden />
              {t("confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type LeadDetail = {
  lead: Record<string, unknown> & {
    id: string;
    name: string;
    phoneE164: string | null;
    phoneRaw: string | null;
    website: string | null;
    websiteType: string;
    temperature: string;
    heatScore: number;
    stage: string;
    note: string | null;
    email: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    plusCode: string | null;
    rating: number | null;
    reviewsCount: number | null;
    claimed: boolean | null;
    priceLevel: number | null;
    photosCount: number | null;
    sourceStrategy: string | null;
    categories: string[];
    sources: Record<string, string[]> | null;
    searchTerm: string | null;
    placeId: string;
    createdAt: string;
    lastSeenAt: string;
  };
};

function LeadDetailDialog({ leadId, onClose, canDelete, working, onDelete, onChanged }: {
  leadId: string | null;
  onClose: () => void;
  canDelete: boolean;
  working: boolean;
  onDelete: (lead: Pick<LeadRow, "id" | "name">) => void;
  onChanged: () => void;
}) {
  const t = useTranslations("leads.detail");
  const tApi = useTranslations("apiErrors");
  const tStages = useTranslations("kanban.stages");
  const [data, setData] = useState<LeadDetail | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    let cancelled = false;
    setData(null);
    apiRequest<LeadDetail>(`/api/leads/${leadId}`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setNote(res.lead.note ?? "");
      })
      .catch((err) => toast.error(tApi(apiErrorCode(err))));
    return () => {
      cancelled = true;
    };
  }, [leadId, tApi]);

  async function save(patch: Record<string, unknown>): Promise<void> {
    if (!data) return;
    setSaving(true);
    try {
      await apiRequest(`/api/leads/${data.lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      toast.success(t("savedToast"));
      onChanged();
      onClose();
    } catch (err) {
      toast.error(tApi(apiErrorCode(err)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={leadId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-h-[85vh] max-w-xl overflow-hidden">
        {!data ? (
          <>
            <DialogTitle className="sr-only">{t("stageLabel")}</DialogTitle>
            <div className="flex items-center justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {data.lead.name}
                <TemperatureBadge temperature={data.lead.temperature} />
                <StageBadge stage={data.lead.stage} />
              </DialogTitle>
              <DialogDescription className="font-mono text-xs">{data.lead.placeId}</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[55vh] pr-2">
              <div className="flex flex-col gap-4 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Field label={t("phone")}>{data.lead.phoneE164 ?? data.lead.phoneRaw ?? "—"}</Field>
                  <Field label={t("website")}>
                    {data.lead.website ? (
                      <a href={data.lead.website} target="_blank" rel="noreferrer" className="break-all text-primary underline-offset-2 hover:underline">{data.lead.website.replace(/^https?:\/\//, "")}</a>
                    ) : (
                      <span className="font-medium text-[#E2530A] dark:text-[#FF8F4D]">{t("noWebsite")}</span>
                    )}
                  </Field>
                  <Field label={t("address")}>{data.lead.address ?? "—"}</Field>
                  <Field label={t("rating")}>{data.lead.rating !== null ? `${data.lead.rating.toFixed(1)} · ${formatNumber(data.lead.reviewsCount ?? 0)} ${t("reviews")}` : "—"}</Field>
                  <Field label={t("coords")}>{data.lead.lat !== null ? `${data.lead.lat!.toFixed(5)}, ${data.lead.lng!.toFixed(5)}` : "—"}</Field>
                  <Field label={t("strategy")}>{data.lead.sourceStrategy ?? "—"}</Field>
                  <Field label={t("heat")}> {data.lead.heatScore}/100</Field>
                  <Field label={t("claimed")}>{data.lead.claimed === null ? "—" : data.lead.claimed ? t("yes") : t("no")}</Field>
                  <Field label={t("search")}>{data.lead.searchTerm ?? "—"}</Field>
                  <Field label={t("lastSeen")}>{formatWhen(data.lead.lastSeenAt, "")}</Field>
                </div>

                {data.lead.categories.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("categories")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.lead.categories.map((c) => (
                        <Badge key={c} variant="outline" className="text-[11px]">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {data.lead.sources && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("sources")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(data.lead.sources).map(([source, fields]) => (
                        <Badge key={source} variant="outline" className="text-[11px] tabular-nums">
                          {source}: {fields.length}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lead-stage">{t("stageLabel")}</Label>
                  <Select value={data.lead.stage} onValueChange={(v) => void save({ stage: v })}>
                    <SelectTrigger id="lead-stage" className="min-h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {KANBAN_STAGES.map((s) => (
                        <SelectItem key={s} value={s}>{tStages(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lead-note">{t("noteLabel")}</Label>
                  <textarea
                    id="lead-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:outline-2 focus-visible:outline-primary"
                    maxLength={2000}
                  />
                  <Button size="sm" variant="outline" className="min-h-9 self-start" disabled={saving} onClick={() => void save({ note })}>
                    {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    {t("saveNote")}
                  </Button>
                </div>
              </div>
            </ScrollArea>
            {canDelete && (
              <DialogFooter>
                <Button variant="ghost" className="min-h-11 text-destructive hover:text-destructive" disabled={working} onClick={() => onDelete(data.lead)}>
                  <Trash2 className="size-4" aria-hidden />
                  {t("delete")}
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="truncate">{children}</div>
    </div>
  );
}
