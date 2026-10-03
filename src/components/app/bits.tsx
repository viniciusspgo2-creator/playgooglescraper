"use client";

/**
 * Bits compartilhados das views do painel (Fases 5–8): badges de temperatura,
 * etapa do Kanban, status de busca/campanha, barra de heat e formatadores.
 * Cores das etapas vêm das variáveis semânticas do globals.css (spec §Kanban).
 */
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function formatWhen(iso: string | null, neverLabel: string): string {
  if (!iso) return neverLabel;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

export function formatNumber(value: number): string {
  return value.toLocaleString(undefined);
}

export function TemperatureBadge({ temperature, className }: { temperature: string; className?: string }) {
  const t = useTranslations("leads.temperature");
  const styles: Record<string, string> = {
    hot: "bg-[#FF6B1A]/12 text-[#E2530A] dark:text-[#FF8F4D] border-[#FF6B1A]/30",
    warm: "bg-[#0B5FFF]/10 text-[#0B5FFF] dark:text-[#6E97FF] border-[#0B5FFF]/30",
    cold: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Pill className={cn(styles[temperature] ?? styles.cold!, className)}>
      {t(temperature as "hot")}
    </Pill>
  );
}

export function StageBadge({ stage, className }: { stage: string; className?: string }) {
  const t = useTranslations("kanban.stages");
  const styles: Record<string, string> = {
    waiting: "bg-[#9AA7B8]/15 text-[#77839B] dark:text-[#9AA7B8] border-[#9AA7B8]/30",
    interested: "bg-[#0B5FFF]/10 text-[#0B5FFF] dark:text-[#6E97FF] border-[#0B5FFF]/30",
    refused: "bg-[#E03131]/10 text-[#E03131] dark:text-[#FF7A7A] border-[#E03131]/30",
    closed: "bg-[#12B886]/10 text-[#0E9F74] dark:text-[#4FD6AE] border-[#12B886]/30",
    production: "bg-[#FF6B1A]/12 text-[#E2530A] dark:text-[#FF8F4D] border-[#FF6B1A]/30",
  };
  return (
    <Pill className={cn(styles[stage] ?? styles.waiting!, className)}>
      {t(stage as "waiting")}
    </Pill>
  );
}

export function GenericStatusBadge({ status, tones, className }: { status: string; tones: Record<string, string>; className?: string }) {
  return <Pill className={cn(tones[status] ?? "bg-muted text-muted-foreground border-border", className)}>{status}</Pill>;
}

export const SEARCH_STATUS_TONES: Record<string, string> = {
  queued: "bg-[#9AA7B8]/15 text-[#77839B] dark:text-[#9AA7B8] border-[#9AA7B8]/30",
  running: "bg-[#0B5FFF]/10 text-[#0B5FFF] dark:text-[#6E97FF] border-[#0B5FFF]/30",
  paused: "bg-[#FF6B1A]/12 text-[#E2530A] dark:text-[#FF8F4D] border-[#FF6B1A]/30",
  done: "bg-[#12B886]/10 text-[#0E9F74] dark:text-[#4FD6AE] border-[#12B886]/30",
  failed: "bg-[#E03131]/10 text-[#E03131] dark:text-[#FF7A7A] border-[#E03131]/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export function HeatBar({ score, className }: { score: number; className?: string }) {
  const color = score >= 70 ? "bg-[#FF6B1A]" : score >= 45 ? "bg-[#0B5FFF]" : "bg-[#9AA7B8]";
  return (
    <div className={cn("flex items-center gap-2", className)} aria-hidden>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${score}%` }} />
      </div>
      <span className="w-7 text-right text-xs tabular-nums text-muted-foreground">{score}</span>
    </div>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", className)}>
      {children}
    </span>
  );
}
