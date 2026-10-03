"use client";

/**
 * KanbanView (Fase 6) — pipeline visual com @dnd-kit: colunas waiting →
 * interested → refused → closed → production. Drag entre colunas atualiza
 * a etapa via PATCH; fallback acessível por teclado (botões ◀ ▶);
 * microinteração (vibrate + spring) ao mover para "closed".
 */
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { ArrowLeft, ArrowRight, GripVertical, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";

import { HeatBar, TemperatureBadge, formatNumber } from "@/components/app/bits";
import { apiErrorCode, apiRequest, useApi } from "@/components/app/use-api";
import { analyticsEvents } from "@/lib/analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { KANBAN_STAGES, type KanbanStage } from "@/shared/contracts";
import { toast } from "sonner";

type LeadRow = {
  id: string;
  name: string;
  phoneE164: string | null;
  temperature: string;
  heatScore: number;
  stage: string;
  primaryCategory: string | null;
  website: string | null;
  hasSite: boolean;
};

type KanbanResponse = {
  columns: Array<{ stage: string; total: number; leads: LeadRow[] }>;
};

const STAGE_ACCENT: Record<string, string> = {
  waiting: "#9AA7B8",
  interested: "#0B5FFF",
  refused: "#E03131",
  closed: "#12B886",
  production: "#FF6B1A",
};

const SPRING = { type: "spring" as const, stiffness: 260, damping: 24 };

export function KanbanView() {
  const t = useTranslations("kanban");
  const tStages = useTranslations("kanban.stages");
  const tApi = useTranslations("apiErrors");
  const q = useApi<KanbanResponse>("/api/kanban");
  const [columns, setColumns] = useState<KanbanResponse["columns"]>([]);
  const [dragging, setDragging] = useState<LeadRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (q.data?.columns) setColumns(q.data.columns);
  }, [q.data]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const moveLead = useCallback(
    async (leadId: string, nextStage: KanbanStage) => {
      setBusyId(leadId);
      // otimista
      setColumns((prev) =>
        prev.map((col) => {
          const lead = col.leads.find((l) => l.id === leadId);
          if (col.stage === nextStage && lead && lead.stage !== nextStage) {
            return { ...col, total: col.total + 1, leads: [{ ...lead, stage: nextStage }, ...col.leads].slice(0, 60) };
          }
          if (col.leads.some((l) => l.id === leadId) && col.stage !== nextStage) {
            return { ...col, total: Math.max(col.total - 1, 0), leads: col.leads.filter((l) => l.id !== leadId) };
          }
          return col;
        })
      );
      try {
        await apiRequest(`/api/leads/${leadId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: nextStage }) });
        if (nextStage === "closed") {
          analyticsEvents.dealClosed();
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate?.(60);
          }
        }
        void q.refetch();
      } catch (err) {
        toast.error(tApi(apiErrorCode(err)));
        void q.refetch();
      } finally {
        setBusyId(null);
      }
    },
    [q, tApi]
  );

  function onDragStart(event: DragStartEvent): void {
    const leadId = String(event.active.id);
    for (const col of columns) {
      const lead = col.leads.find((l) => l.id === leadId);
      if (lead) {
        setDragging(lead);
        return;
      }
    }
  }

  function onDragEnd(event: DragEndEvent): void {
    setDragging(null);
    const overId = event.over?.id;
    if (!overId) return;
    const nextStage = String(overId) as KanbanStage;
    const leadId = String(event.active.id);
    const current = columns.find((c) => c.leads.some((l) => l.id === leadId))?.stage;
    if (current && current !== nextStage && KANBAN_STAGES.includes(nextStage)) {
      void moveLead(leadId, nextStage);
    }
  }

  function stageIndex(stage: string): number {
    return KANBAN_STAGES.indexOf(stage as KanbanStage);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {q.loading && columns.length === 0 ? (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {KANBAN_STAGES.map((s) => (
            <Skeleton key={s} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-5" role="list" aria-label={t("title")}>
            {columns.map((col) => (
              <KanbanColumn
                key={col.stage}
                stage={col.stage}
                total={col.total}
                leads={col.leads}
                onMove={moveLead}
                busyId={busyId}
              />
            ))}
          </div>
          <DragOverlay>
            {dragging ? (
              <div className="rotate-2 rounded-lg border bg-background p-3 shadow-lg">
                <p className="text-sm font-medium">{dragging.name}</p>
                <HeatBar score={dragging.heatScore} className="mt-1" />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <p className="text-xs text-muted-foreground">{t("keyboardHint")}</p>
    </div>
  );
}

function KanbanColumn({ stage, total, leads, onMove, busyId }: {
  stage: string;
  total: number;
  leads: LeadRow[];
  onMove: (leadId: string, stage: KanbanStage) => Promise<void>;
  busyId: string | null;
}) {
  const t = useTranslations("kanban");
  const tStages = useTranslations("kanban.stages");
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      role="listitem"
      aria-label={tStages(stage as "waiting")}
      className={cn(
        "flex min-h-72 flex-col rounded-xl border bg-muted/40 transition-colors",
        isOver && "border-primary/60 bg-primary/5"
      )}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <span className="size-2.5 rounded-full" style={{ background: STAGE_ACCENT[stage] }} aria-hidden />
        <span className="text-sm font-medium">{tStages(stage as "waiting")}</span>
        <Badge variant="outline" className="ml-auto text-[11px] tabular-nums">{formatNumber(total)}</Badge>
      </div>
      <div className="flex max-h-[56vh] flex-col gap-2 overflow-y-auto p-2 scrollbar-thin">
        {leads.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{t("emptyColumn")}</p>
        ) : (
          leads.map((lead) => (
            <KanbanCard key={lead.id} lead={lead} stage={stage} onMove={onMove} busy={busyId === lead.id} />
          ))
        )}
      </div>
    </div>
  );
}

function KanbanCard({ lead, stage, onMove, busy }: {
  lead: LeadRow;
  stage: string;
  onMove: (leadId: string, stage: KanbanStage) => Promise<void>;
  busy: boolean;
}) {
  const t = useTranslations("kanban");
  const tStages = useTranslations("kanban.stages");
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  const index = KANBAN_STAGES.indexOf(stage as KanbanStage);
  const prev = index > 0 ? KANBAN_STAGES[index - 1] : null;
  const next = index < KANBAN_STAGES.length - 1 ? KANBAN_STAGES[index + 1] : null;

  return (
    <motion.div
      ref={setNodeRef}
      layout
      transition={SPRING}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
      className={cn("group rounded-lg border bg-background p-2.5", isDragging && "rotate-2 shadow-md")}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none rounded text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing"
          aria-label={t("dragAria", { name: lead.name })}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{lead.name}</p>
          <p className="truncate text-xs text-muted-foreground">{lead.primaryCategory ?? "—"}{lead.phoneE164 ? ` · ${lead.phoneE164}` : ""}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <TemperatureBadge temperature={lead.temperature} />
            <HeatBar score={lead.heatScore} />
          </div>
        </div>
      </div>
      <div className="mt-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {prev && (
          <Button size="sm" variant="ghost" className="min-h-8 px-1.5" disabled={busy} aria-label={t("moveTo", { stage: tStages(prev) })} onClick={() => void onMove(lead.id, prev)}>
            <ArrowLeft className="size-3.5" aria-hidden />
          </Button>
        )}
        {next && (
          <Button size="sm" variant="ghost" className="ml-auto min-h-8 px-1.5" disabled={busy} aria-label={t("moveTo", { stage: tStages(next) })} onClick={() => void onMove(lead.id, next)}>
            <ArrowRight className="size-3.5" aria-hidden />
          </Button>
        )}
      </div>
      {busy && <Loader2 className="absolute right-3 top-3 size-4 animate-spin text-muted-foreground" aria-hidden />}
    </motion.div>
  );
}
