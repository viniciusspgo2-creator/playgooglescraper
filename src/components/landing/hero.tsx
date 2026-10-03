"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { springTransition } from "@/lib/motion";
import { CounterUp } from "./counter-up";
import { DemoAnimation } from "./demo-animation";
import { useSession } from "@/components/app/session";
import { analyticsEvents } from "@/lib/analytics";

export function Hero() {
  const t = useTranslations("hero");
  const { session, openAuth, setView } = useSession();
  const reduced = useReducedMotion();

  return (
    <section id="inicio" className="relative overflow-hidden pt-16">
      {/* Fundo: grid sutil + blobs de marca */}
      <div className="bg-grid mask-fade-b pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full opacity-25 blur-3xl bg-brand-gradient"
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-8 lg:pb-24 lg:pt-20">
        <div className="max-w-xl">
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springTransition}
          >
            <Badge
              variant="outline"
              className="glow-orange gap-1.5 border-primary/30 bg-primary/5 py-1.5 pl-2 pr-3 text-xs font-semibold text-primary"
            >
              <Sparkles className="size-3.5" aria-hidden />
              {t("badge")}
            </Badge>
          </motion.div>

          <motion.h1
            className="mt-5 font-display text-4xl font-bold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem]"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springTransition, delay: 0.05 }}
          >
            {t("titleTop")}{" "}
            <span className="text-brand-gradient">{t("titleHighlight")}</span>
          </motion.h1>

          <motion.p
            className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springTransition, delay: 0.12 }}
          >
            {t("subtitle")}
          </motion.p>

          <motion.div
            className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springTransition, delay: 0.18 }}
          >
            <Button
              size="lg"
              onClick={() => {
                analyticsEvents.ctaClick("hero_primary");
                if (session) setView("app");
                else openAuth("signup");
              }}
              className="glow-orange-lg group min-h-12 bg-primary px-7 text-base font-semibold text-primary-foreground transition-shadow hover:shadow-[0_8px_32px_rgba(255,107,26,0.45)]"
            >
              {t("ctaPrimary")}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="min-h-12 border-border px-6 text-base font-medium"
            >
              <a
                href="#como-funciona"
                onClick={() => analyticsEvents.ctaClick("hero_secondary", "#como-funciona")}
              >
                {t("ctaSecondary")}
                <ChevronDown className="size-4" aria-hidden />
              </a>
            </Button>
          </motion.div>

          <motion.p
            className="mt-4 text-xs text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...springTransition, delay: 0.28 }}
          >
            {t("trust")}
          </motion.p>
        </div>

        <motion.div
          className="flex justify-center lg:justify-end"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 32, rotate: 1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ ...springTransition, delay: 0.15 }}
        >
          <DemoAnimation />
        </motion.div>
      </div>

      {/* Stats com counter-up */}
      <div className="relative mx-auto max-w-7xl px-4 pb-14 sm:px-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(
            [
              { value: 4000, display: t("stats.perHour.value"), label: t("stats.perHour.label"), highlight: true },
              { display: t("stats.limit.value"), label: t("stats.limit.label"), highlight: false },
              { value: 4, display: t("stats.modes.value"), label: t("stats.modes.label"), highlight: false },
            ] as const
          ).map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...springTransition, delay: i * 0.08 }}
              className={
                stat.highlight
                  ? "bg-brand-gradient hover-lift rounded-2xl p-5 text-white shadow-[0_16px_48px_-16px_rgba(255,107,26,0.5)]"
                  : "hover-lift rounded-2xl border bg-card p-5"
              }
            >
              <dt className="order-2 text-xs font-medium opacity-80">
                {stat.label}
              </dt>
              <dd className="order-1 font-display text-3xl font-bold tracking-tight">
                {"value" in stat && stat.value !== undefined ? (
                  <CounterUp value={stat.value} staticValue={stat.display} />
                ) : (
                  stat.display
                )}
              </dd>
            </motion.div>
          ))}
        </dl>
      </div>
    </section>
  );
}
