"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { springTransition } from "@/lib/motion";
import { Section, SectionHeading } from "./section";
import { useSession } from "@/components/app/session";

type PlanKey = "starter" | "pro" | "business";
type Currency = "BRL" | "USD" | "EUR";
type Billing = "monthly" | "annual";

/** Tabela de preços do produto (dados de lançamento, não mock). */
const PRICES: Record<Currency, Record<PlanKey, { monthly: number; annual: number }>> = {
  BRL: {
    starter: { monthly: 97, annual: 77 },
    pro: { monthly: 197, annual: 157 },
    business: { monthly: 497, annual: 397 },
  },
  USD: {
    starter: { monthly: 19, annual: 15 },
    pro: { monthly: 39, annual: 31 },
    business: { monthly: 99, annual: 79 },
  },
  EUR: {
    starter: { monthly: 19, annual: 15 },
    pro: { monthly: 39, annual: 31 },
    business: { monthly: 99, annual: 79 },
  },
};

const CURRENCY_SYMBOL: Record<Currency, string> = { BRL: "R$", USD: "$", EUR: "€" };

const PLAN_ORDER: PlanKey[] = ["starter", "pro", "business"];

export function Pricing() {
  const t = useTranslations("pricing");
  const { session, openAuth, setView } = useSession();
  const reduced = useReducedMotion();
  const [currency, setCurrency] = useState<Currency>("BRL");
  const [billing, setBilling] = useState<Billing>("monthly");

  const plans = t.raw("plans") as Record<
    PlanKey,
    { name: string; description: string; features: string[] }
  >;

  return (
    <Section id="precos" ariaLabel={t("title")} className="bg-muted/40">
      <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      {/* Controles: moeda + ciclo */}
      <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
        <Tabs
          value={currency}
          onValueChange={(v) => setCurrency(v as Currency)}
          aria-label={t("currencyLabel")}
        >
          <TabsList className="h-11">
            <TabsTrigger value="BRL" className="min-h-9 px-4">R$ BRL</TabsTrigger>
            <TabsTrigger value="USD" className="min-h-9 px-4">$ USD</TabsTrigger>
            <TabsTrigger value="EUR" className="min-h-9 px-4">€ EUR</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            className={cn(
              "rounded-md py-1 text-sm font-medium transition-colors",
              billing === "monthly" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("monthly")}
          </button>
          <Switch
            checked={billing === "annual"}
            onCheckedChange={(checked) => setBilling(checked ? "annual" : "monthly")}
            aria-label={`${t("monthly")} / ${t("annual")}`}
          />
          <button
            type="button"
            onClick={() => setBilling("annual")}
            className={cn(
              "rounded-md py-1 text-sm font-medium transition-colors",
              billing === "annual" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("annual")}
          </button>
          <Badge className="bg-status-closed/15 text-status-closed hover:bg-status-closed/15 border border-status-closed/30 text-[10px] font-semibold">
            {t("annualBadge")}
          </Badge>
        </div>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {PLAN_ORDER.map((key, i) => {
          const plan = plans[key];
          const price = PRICES[currency][key][billing];
          const popular = key === "pro";

          return (
            <motion.div
              key={key}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...springTransition, delay: i * 0.08 }}
              className={cn("relative", popular && "lg:-mt-3 lg:mb-3")}
            >
              {popular && (
                <div
                  className="bg-brand-gradient absolute -inset-px -z-10 rounded-2xl opacity-90"
                  aria-hidden
                />
              )}
              <Card
                className={cn(
                  "flex h-full flex-col rounded-2xl",
                  popular && "border-0 shadow-[0_20px_60px_-20px_rgba(255,107,26,0.45)]"
                )}
              >
                <CardHeader className="pb-4">
                  {popular && (
                    <Badge className="mb-2 w-fit gap-1 bg-primary text-primary-foreground hover:bg-primary">
                      <Sparkles className="size-3" aria-hidden />
                      {t("popular")}
                    </Badge>
                  )}
                  <CardTitle className="font-display text-xl font-bold">{plan.name}</CardTitle>
                  <CardDescription className="text-sm">{plan.description}</CardDescription>
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="font-display text-4xl font-bold tabular-nums tracking-tight text-foreground">
                      {CURRENCY_SYMBOL[currency]}
                      {price}
                    </span>
                    <span className="text-sm text-muted-foreground">{t("perMonth")}</span>
                  </div>
                  {billing === "annual" && (
                    <p className="text-xs text-muted-foreground">{t("billedAnnually")}</p>
                  )}
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm">
                        <Check
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            popular ? "text-primary" : "text-status-closed"
                          )}
                          aria-hidden
                        />
                        <span className="text-foreground/90">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    onClick={() => (session ? setView("app") : openAuth("signup"))}
                    className={cn(
                      "min-h-11 w-full font-semibold",
                      popular
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
                    )}
                  >
                    {t("cta", { name: plan.name })}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">{t("creditsNote")}</p>
    </Section>
  );
}
