"use client";

/** Página Sobre — E-E-A-T institucional (missão, engenharia, confiança, contato). */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Building2, CheckCircle2, HeartHandshake, Lock, ShieldCheck } from "lucide-react";

import { useAppLocale } from "@/i18n/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";

export function AboutView() {
  const t = useTranslations("content");
  const { locale } = useAppLocale();

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-28 sm:px-6">
      <header>
        <Badge
          variant="outline"
          className="border-primary/30 bg-primary/5 text-xs font-semibold text-primary"
        >
          <Building2 className="mr-1.5 size-3.5" aria-hidden />
          {SITE.name}
        </Badge>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {t("aboutH1")}
        </h1>
        <p className="mt-4 rounded-2xl border-l-4 border-primary bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("aboutBluf")}
        </p>
      </header>

      <div className="mt-12 space-y-8">
        <section aria-labelledby="about-mission">
          <h2 id="about-mission" className="font-display text-2xl font-bold tracking-tight text-foreground">
            {t("aboutMissionTitle")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {t("aboutMissionText")}
          </p>
        </section>

        <section aria-labelledby="about-how">
          <h2 id="about-how" className="font-display text-2xl font-bold tracking-tight text-foreground">
            {t("aboutHowTitle")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {t("aboutHowText")}
          </p>
        </section>

        <section aria-labelledby="about-engineering">
          <h2 id="about-engineering" className="font-display text-2xl font-bold tracking-tight text-foreground">
            {t("aboutEngineeringTitle")}
          </h2>
          <ul className="mt-3 space-y-2.5">
            {(t.raw("aboutEngineeringList") as string[]).map((item) => (
              <li
                key={item.slice(0, 64)}
                className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground sm:text-base"
              >
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-blue" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="about-trust">
          <h2 id="about-trust" className="font-display text-2xl font-bold tracking-tight text-foreground">
            {t("aboutTrustTitle")}
          </h2>
          <ul className="mt-3 space-y-2.5">
            {(t.raw("aboutTrustList") as string[]).map((item) => (
              <li
                key={item.slice(0, 64)}
                className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground sm:text-base"
              >
                <Lock className="mt-0.5 size-4 shrink-0 text-status-closed" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="about-who">
          <h2 id="about-who" className="font-display text-2xl font-bold tracking-tight text-foreground">
            {t("aboutWhoTitle")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{t("aboutWhoText")}</p>
        </section>

        <section aria-labelledby="about-contact" className="rounded-2xl border bg-card p-6">
          <h2 id="about-contact" className="flex items-center gap-2 font-display text-xl font-bold tracking-tight text-foreground">
            <HeartHandshake className="size-5 text-primary" aria-hidden />
            {t("aboutContactTitle")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t("aboutContactText")}
          </p>
          <Button asChild className="mt-5 min-h-12 bg-primary px-6 text-primary-foreground">
            <Link href="/#precos">
              {t("aboutCta")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
