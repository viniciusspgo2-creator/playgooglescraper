"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";
import { useSession } from "@/components/app/session";

export function Faq() {
  const t = useTranslations("faq");
  const items = t.raw("items") as { q: string; a: string }[];

  return (
    <Section id="faq" ariaLabel={t("title")}>
      <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      <Reveal delay={0.1} className="mx-auto mt-10 max-w-3xl">
        <Accordion type="single" collapsible className="w-full">
          {items.map((item, i) => (
            <AccordionItem key={item.q} value={`item-${i}`}>
              <AccordionTrigger className="min-h-11 text-left text-[15px] font-semibold text-foreground hover:text-primary hover:no-underline">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Reveal>
    </Section>
  );
}

export function FinalCta() {
  const t = useTranslations("finalCta");
  const { session, openAuth, setView } = useSession();

  return (
    <Section ariaLabel={t("title")}>
      <Reveal>
        <div className="bg-brand-gradient relative overflow-hidden rounded-3xl px-6 py-14 text-center text-white sm:px-12 sm:py-16">
          <div
            className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/15 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-20 -right-10 h-64 w-64 rounded-full bg-black/15 blur-3xl"
            aria-hidden
          />
          <h2 className="relative mx-auto max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-sm text-white/85 sm:text-base">
            {t("subtitle")}
          </p>
          <div className="relative mt-8">
            <Button
              size="lg"
              onClick={() => (session ? setView("app") : openAuth("signup"))}
              className="min-h-12 bg-white px-8 text-base font-semibold text-[#0A2540] shadow-lg transition-transform hover:scale-[1.02] hover:bg-white"
            >
              {t("button")}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
          <p className="relative mt-5 inline-flex items-center gap-1.5 text-xs text-white/80">
            <ShieldCheck className="size-3.5" aria-hidden />
            {t("note")}
          </p>
        </div>
      </Reveal>
    </Section>
  );
}
