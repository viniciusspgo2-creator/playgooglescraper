"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Flame, MapPin, ShieldCheck, Wifi } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { springTransition } from "@/lib/motion";

/**
 * Demo animada do side panel da extensão: leads "chegando" em loop,
 * células do quadtree avançando, contador ao vivo e estratégia rotativa.
 * Conteúdo claramente rotulado como animação (não são dados reais).
 */

const DEMO_LEADS = [
  { name: "Barbearia Central", kind: "hot" },
  { name: "Studio Corte Fino", kind: "warm" },
  { name: "Barbearia Dom Clássico", kind: "cold" },
  { name: "Navalha & Cia", kind: "hot" },
  { name: "Barbearia Nova Era", kind: "hot" },
  { name: "Barbearia do Parque", kind: "warm" },
  { name: "Corte Certo", kind: "cold" },
  { name: "Barbearia Real", kind: "hot" },
] as const;

type LeadKind = (typeof DEMO_LEADS)[number]["kind"];
type Strategy = "payload" | "dom" | "detail";
type DemoLead = { id: number; name: string; kind: LeadKind };

const STRATEGIES: Strategy[] = ["payload", "payload", "dom", "payload", "detail", "payload"];

/** Versão estática (reduced-motion) — derivada, sem estado. */
const STATIC_LEADS: DemoLead[] = DEMO_LEADS.slice(0, 5).map((l, i) => ({
  id: i + 1,
  name: l.name,
  kind: l.kind,
}));

function KindChip({ kind }: { kind: LeadKind }) {
  const t = useTranslations("demo");
  const map: Record<LeadKind, { label: string; className: string }> = {
    hot: { label: t("hot"), className: "bg-primary/12 text-primary border-primary/30" },
    warm: { label: t("warm"), className: "bg-brand-blue/10 text-brand-blue border-brand-blue/30 dark:text-[#5b8dff]" },
    cold: { label: t("cold"), className: "bg-muted text-muted-foreground border-border" },
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        map[kind].className
      )}
    >
      {kind === "hot" && <Flame className="size-3" aria-hidden />}
      {map[kind].label}
    </span>
  );
}

export function DemoAnimation() {
  const t = useTranslations("demo");
  const reduced = useReducedMotion();

  const [leads, setLeads] = useState<DemoLead[]>([]);
  const [strategy, setStrategy] = useState<Strategy>("payload");
  const [cells, setCells] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (reduced) return; // reduced-motion: render estático derivado, sem loop.
    let id = 0;
    let tick = 0;
    const interval = setInterval(() => {
      tick += 1;
      const lead = DEMO_LEADS[id % DEMO_LEADS.length];
      id += 1;
      setLeads((prev) => [...prev.slice(-4), { id, name: lead.name, kind: lead.kind }]);
      setCount((c) => c + 1 + (id % 3 === 0 ? 2 : 0));
      setCells((c) => Math.min(c + (id % 2), 47));
      if (tick % 4 === 0) {
        setStrategy(STRATEGIES[tick % STRATEGIES.length]);
      }
    }, 2100);
    return () => clearInterval(interval);
  }, [reduced]);

  // Valores exibidos: derivados para o modo estático.
  const visibleLeads = reduced ? STATIC_LEADS : leads;
  const displayCells = reduced ? 47 : cells;
  const displayCount = reduced ? STATIC_LEADS.length + 11 : count;

  const strategyLabel =
    strategy === "payload"
      ? t("strategyPayload")
      : strategy === "dom"
        ? t("strategyDom")
        : t("strategyDetail");

  return (
    <div
      className="relative w-full max-w-md rounded-2xl border bg-card shadow-[0_24px_80px_-24px_rgba(10,37,64,0.35)] dark:shadow-[0_24px_80px_-24px_rgba(0,0,0,0.7)]"
      role="img"
      aria-label={t("footer")}
    >
      {/* Cabeçalho do painel */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Image src="/brand/logo.png" alt="" width={22} height={22} className="size-6 object-contain" />
          <span className="text-xs font-semibold text-foreground">{t("title")}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-status-closed">
          <span className="pulse-dot inline-block size-2 rounded-full bg-status-closed" aria-hidden />
          {t("live")}
        </span>
      </div>

      {/* Linha de busca + modo */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/50 px-4 py-2.5">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
          <MapPin className="size-3.5 text-primary" aria-hidden />
          {t("search")}
        </span>
        <Badge variant="secondary" className="text-[10px]">{t("mode")}</Badge>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-status-closed">
          <ShieldCheck className="size-3" aria-hidden />
          {t("blocked")}
        </span>
      </div>

      {/* Métricas ao vivo */}
      <div className="grid grid-cols-3 gap-px border-b bg-border/60 text-center">
        <div className="bg-card px-2 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("cells")}</p>
          <p className="text-sm font-bold tabular-nums text-foreground">
            {displayCells}<span className="text-muted-foreground">/47</span>
          </p>
        </div>
        <div className="bg-card px-2 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("leads")}</p>
          <p className="text-sm font-bold tabular-nums text-primary">{displayCount}</p>
        </div>
        <div className="bg-card px-2 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("eta")}</p>
          <p className="text-sm font-bold tabular-nums text-foreground">12:40</p>
        </div>
      </div>

      {/* Progresso de células */}
      <div className="px-4 pt-3">
        <Progress value={(displayCells / 47) * 100} className="h-1.5" aria-label={t("cells")} />
      </div>

      {/* Lista de leads chegando */}
      <div className="flex h-44 flex-col gap-1.5 overflow-hidden px-4 py-3" aria-hidden>
        <AnimatePresence initial={false} mode="popLayout">
          {visibleLeads.map((lead) => (
            <motion.div
              key={lead.id}
              layout
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={springTransition}
              className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2"
            >
              <span className="truncate text-xs font-medium text-foreground">{lead.name}</span>
              <span className="flex items-center gap-1.5">
                <KindChip kind={lead.kind} />
                {lead.kind !== "cold" && (
                  <span className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                    {t("noSite")}
                  </span>
                )}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Estratégia atual + rodapé */}
      <div className="flex items-center justify-between border-t bg-muted/40 px-4 py-2.5">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Wifi className="size-3" aria-hidden />
          {t("strategy")}: <strong className="font-semibold text-foreground">{strategyLabel}</strong>
        </span>
      </div>
      <p className="border-t px-4 py-2 text-center text-[10px] text-muted-foreground">
        {t("footer")}
      </p>
    </div>
  );
}
