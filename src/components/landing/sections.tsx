"use client";

import {
  Building2,
  CheckCircle2,
  Flame,
  Gauge,
  Grid3x3,
  KanbanSquare,
  Layers,
  ShieldCheck,
  ShieldOff,
  TrendingDown,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";

const PAIN_ICONS = [TrendingDown, Layers, ShieldOff] as const;

export function ProblemSolution() {
  const t = useTranslations("problem");
  const pains = t.raw("pains") as { title: string; text: string }[];

  return (
    <Section ariaLabel={t("title")}>
      <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {pains.map((pain, i) => {
          const Icon = PAIN_ICONS[i] ?? TrendingDown;
          return (
            <Reveal key={pain.title} delay={i * 0.08}>
              <article className="hover-lift h-full rounded-2xl border bg-card p-6">
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-status-refused/10 text-status-refused">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-foreground">
                  {pain.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pain.text}</p>
              </article>
            </Reveal>
          );
        })}
      </div>

      <Reveal delay={0.1} className="mt-8">
        <div className="relative overflow-hidden rounded-2xl bg-brand-blue-deep p-7 text-white sm:p-10 dark:bg-card dark:ring-1 dark:ring-border">
          <div
            className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/25 blur-3xl"
            aria-hidden
          />
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-brand-orange-soft">
                <Gauge className="size-4" aria-hidden />
                {t("solutionTitle")}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-white/85 sm:text-base">
                {t("solutionText")}
              </p>
            </div>
            <ul className="space-y-3">
              {t.raw("solutionBullets").map((bullet: string) => (
                <li key={bullet} className="flex items-start gap-2.5 text-sm font-medium">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-orange-soft" aria-hidden />
                  <span className="text-white/90">{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

export function HowItWorks() {
  const t = useTranslations("how");
  const steps = t.raw("steps") as { title: string; text: string }[];

  return (
    <Section id="como-funciona" ariaLabel={t("title")} className="bg-muted/40">
      <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      <ol className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-6">
        {/* Linha conectora (desktop) */}
        <div
          className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block"
          aria-hidden
        />
        {steps.map((step, i) => (
          <Reveal key={step.title} delay={i * 0.12} as="li">
            <div className="relative flex flex-col items-center text-center md:items-start md:text-left">
              <span className="glow-orange z-10 inline-flex size-12 items-center justify-center rounded-full bg-brand-gradient font-display text-lg font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                {step.text}
              </p>
            </div>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}

export function Features() {
  const t = useTranslations("features");
  const items = t.raw("items") as { title: string; text: string }[];
  const icons = [Grid3x3, Flame, Gauge, ShieldCheck, KanbanSquare, Building2];

  return (
    <Section id="recursos" ariaLabel={t("title")}>
      <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => {
          const Icon = icons[i] ?? Grid3x3;
          return (
            <Reveal key={item.title} delay={(i % 3) * 0.08}>
              <article className="hover-lift group h-full rounded-2xl border bg-card p-6 transition-colors hover:border-primary/40">
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
              </article>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
