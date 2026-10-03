"use client";

/**
 * SearchesView (Fase 5) — criação de buscas planejadas (fila assumida pela
 * extensão via /api/v1/search/claim), progresso de células Quadtree e mapa
 * de células com status/resultado. Retomada persistida no servidor.
 */
import { Loader2, MapPinned, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useSession } from "@/components/app/session";
import { GenericStatusBadge, SEARCH_STATUS_TONES, formatNumber, formatWhen } from "@/components/app/bits";
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
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type SearchRow = {
  id: string;
  term: string;
  status: string;
  speedMode: string;
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number | null;
  maxDepth: number;
  cellsTotal: number;
  cellsDone: number;
  leadsFound: number;
  leadsActual: number;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  createdAt: string;
};

type SearchDetail = {
  search: SearchRow & { extId: string | null };
  cells: Array<{
    id: string;
    depth: number;
    latMin: number;
    lngMin: number;
    latMax: number;
    lngMax: number;
    status: string;
    found: number;
    attempts: number;
    lastError: string | null;
  }>;
};

type SearchesResponse = { searches: SearchRow[] };

const SPEED_LABELS = ["stealth", "moderate", "fast", "turbo"] as const;

export function SearchesView() {
  const t = useTranslations("searches");
  const tApi = useTranslations("apiErrors");
  const { session } = useSession();
  const q = useApi<SearchesResponse>("/api/searches");
  const canManage = session?.user.role === "owner" || session?.user.role === "admin";

  const [createOpen, setCreateOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [detail, setDetail] = useState<SearchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function openDetail(id: string): Promise<void> {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await apiRequest<{ search: SearchDetail["search"]; cells: SearchDetail["cells"] }>(`/api/searches/${id}`);
      setDetail({ search: res.search, cells: res.cells });
    } catch (err) {
      toast.error(tApi(apiErrorCode(err)));
    } finally {
      setDetailLoading(false);
    }
  }

  async function changeStatus(id: string, status: string): Promise<void> {
    try {
      await apiRequest(`/api/searches/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      toast.success(t("statusToast"));
      void q.refetch();
      if (detail?.search.id === id) await openDetail(id);
    } catch (err) {
      toast.error(tApi(apiErrorCode(err)));
    }
  }

  async function removeSearch(id: string): Promise<void> {
    try {
      await apiRequest(`/api/searches/${id}`, { method: "DELETE" });
      toast.success(t("deleteToast"));
      setDetail(null);
      void q.refetch();
    } catch (err) {
      toast.error(tApi(apiErrorCode(err)));
    }
  }

  const searches = q.data?.searches ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)} className="min-h-11">
            <Plus className="size-4" aria-hidden />
            {t("createCta")}
          </Button>
        )}
      </div>

      {q.loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : searches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MapPinned className="size-6" aria-hidden />
            </span>
            <p className="max-w-md text-sm text-muted-foreground">{t("empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {searches.map((s) => {
            const pct = s.cellsTotal > 0 ? Math.round((s.cellsDone / s.cellsTotal) * 100) : 0;
            return (
              <Card key={s.id} className="transition-transform hover:-translate-y-0.5">
                <CardContent className="p-4">
                  <button type="button" onClick={() => void openDetail(s.id)} className="w-full text-left" aria-label={t("openDetailAria", { term: s.term })}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.term}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatWhen(s.createdAt, "")} · {t("speed." + s.speedMode as "speedModerate")}
                        </p>
                      </div>
                      <GenericStatusBadge status={s.status} tones={SEARCH_STATUS_TONES} />
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Progress value={pct} className="h-1.5" aria-label={t("cellsProgress")} />
                      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{s.cellsDone}/{s.cellsTotal} · {pct}%</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline" className="text-[11px] tabular-nums">{t("leadsFound", { count: formatNumber(s.leadsActual) })}</Badge>
                      <Badge variant="outline" className="text-[11px]">{t("maxDepth", { depth: s.maxDepth })}</Badge>
                      {s.radiusKm !== null && <Badge variant="outline" className="text-[11px]">{t("radius", { km: s.radiusKm })}</Badge>}
                    </div>
                  </button>
                  {canManage && ["queued", "running", "paused"].includes(s.status) && (
                    <div className="mt-3 flex gap-2">
                      {s.status === "running" ? (
                        <Button size="sm" variant="outline" className="min-h-9" onClick={() => void changeStatus(s.id, "paused")}>{t("pause")}</Button>
                      ) : (
                        <Button size="sm" variant="outline" className="min-h-9" onClick={() => void changeStatus(s.id, "running")}>{t("resume")}</Button>
                      )}
                      <Button size="sm" variant="ghost" className="min-h-9 text-destructive hover:text-destructive" onClick={() => void changeStatus(s.id, "cancelled")}>{t("cancel")}</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateSearchDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          void q.refetch();
          setCreateOpen(false);
        }}
      />

      {/* Detalhe: células do Quadtree */}
      <Dialog open={detailLoading || detail !== null} onOpenChange={(open) => { if (!open) { setDetail(null); setDetailLoading(false); } }}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
          {detailLoading || !detail ? (
            <>
              <DialogTitle className="sr-only">{t("title")}</DialogTitle>
              <div className="flex items-center justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail.search.term}
                  <GenericStatusBadge status={detail.search.status} tones={SEARCH_STATUS_TONES} />
                </DialogTitle>
                <DialogDescription>
                  {formatNumber(detail.cells.length)} {t("cellsCount")} · {t("leadsFound", { count: formatNumber(detail.search.leadsActual) })}
                  {detail.search.lastError ? ` · ${detail.search.lastError}` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="mb-3 flex flex-wrap gap-2">
                {canManage && ["queued", "running", "paused"].includes(detail.search.status) && (
                  <>
                    {detail.search.status === "running" ? (
                      <Button size="sm" variant="outline" onClick={() => void changeStatus(detail.search.id, "paused")}>{t("pause")}</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => void changeStatus(detail.search.id, "running")}>{t("resume")}</Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void changeStatus(detail.search.id, "cancelled")}>{t("cancel")}</Button>
                    <Separator orientation="vertical" className="mx-1" />
                  </>
                )}
                {canManage && (
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void removeSearch(detail.search.id)}>
                    <Trash2 className="size-4" aria-hidden />
                    {t("delete")}
                  </Button>
                )}
              </div>
              <ScrollArea className="max-h-96 rounded-lg border">
                <div className="p-2">
                  {detail.cells.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">{t("noCells")}</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="p-2 font-medium">#</th>
                          <th className="p-2 font-medium">{t("cellCenter")}</th>
                          <th className="p-2 font-medium">{t("cellDepth")}</th>
                          <th className="p-2 font-medium">{t("cellFound")}</th>
                          <th className="p-2 font-medium">{t("cellStatus")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.cells.map((c, i) => (
                          <tr key={c.id} className="border-t">
                            <td className="p-2 tabular-nums text-muted-foreground">{i + 1}</td>
                            <td className="p-2 font-mono text-xs tabular-nums">
                              {c.latMin.toFixed(3)}, {c.lngMin.toFixed(3)} → {c.latMax.toFixed(3)}, {c.lngMax.toFixed(3)}
                            </td>
                            <td className="p-2 tabular-nums">{c.depth}</td>
                            <td className="p-2 tabular-nums">{c.found}</td>
                            <td className="p-2">
                              <GenericStatusBadge
                                status={c.status}
                                tones={{
                                  pending: "bg-muted text-muted-foreground border-border",
                                  running: "bg-[#0B5FFF]/10 text-[#0B5FFF] dark:text-[#6E97FF] border-[#0B5FFF]/30",
                                  saturated: "bg-[#FF6B1A]/12 text-[#E2530A] dark:text-[#FF8F4D] border-[#FF6B1A]/30",
                                  exhausted: "bg-[#12B886]/10 text-[#0E9F74] dark:text-[#4FD6AE] border-[#12B886]/30",
                                  failed: "bg-[#E03131]/10 text-[#E03131] dark:text-[#FF7A7A] border-[#E03131]/30",
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateSearchDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const t = useTranslations("searches.create");
  const tApi = useTranslations("apiErrors");
  const [working, setWorking] = useState(false);
  const [term, setTerm] = useState("");
  const [centerLat, setCenterLat] = useState("");
  const [centerLng, setCenterLng] = useState("");
  const [radiusKm, setRadiusKm] = useState("10");
  const [speedMode, setSpeedMode] = useState<(typeof SPEED_LABELS)[number]>("moderate");

  async function submit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setWorking(true);
    try {
      await apiRequest("/api/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          term: term.trim(),
          speedMode,
          radiusKm: Number(radiusKm) || 10,
          ...(centerLat.trim() && centerLng.trim() ? { centerLat: Number(centerLat), centerLng: Number(centerLng) } : {}),
        }),
      });
      toast.success(t("toast"));
      onCreated();
    } catch (err) {
      toast.error(tApi(apiErrorCode(err)));
    } finally {
      setWorking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="search-term">{t("term")}</Label>
            <Input id="search-term" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t("termPlaceholder")} required minLength={2} maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="search-lat">{t("centerLat")}</Label>
              <Input id="search-lat" type="number" step="any" min={-90} max={90} value={centerLat} onChange={(e) => setCenterLat(e.target.value)} placeholder="-16.686" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="search-lng">{t("centerLng")}</Label>
              <Input id="search-lng" type="number" step="any" min={-180} max={180} value={centerLng} onChange={(e) => setCenterLng(e.target.value)} placeholder="-49.264" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="search-radius">{t("radius")}</Label>
              <Input id="search-radius" type="number" step="0.5" min={0.5} max={200} value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("speedMode")}</Label>
              <Select value={speedMode} onValueChange={(v) => setSpeedMode(v as (typeof SPEED_LABELS)[number])}>
                <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPEED_LABELS.map((s) => (
                    <SelectItem key={s} value={s}>{t("speed." + s as "speedModerate")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("note")}</p>
          <DialogFooter>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
            <Button type="submit" className="min-h-11" disabled={working || term.trim().length < 2}>
              {working && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
