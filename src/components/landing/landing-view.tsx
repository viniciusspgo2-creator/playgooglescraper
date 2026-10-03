"use client";

/**
 * Landing completa (mesmas seções da Fase 1) — agora client, dentro do shell
 * de rota única, para alternar com o Workspace sem reload (ADR-003 §D1).
 */
import { useTranslations } from "next-intl";

import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { QuickSummary } from "@/components/landing/quick-summary";
import { Comparison } from "@/components/landing/comparison";
import { Pricing } from "@/components/landing/pricing";
import { Faq, FinalCta } from "@/components/landing/faq-finalcta";
import { Features, HowItWorks, ProblemSolution } from "@/components/landing/sections";

export function LandingView() {
  const t = useTranslations("common");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t("skipToContent")}
      </a>
      <Header />
      <main id="conteudo" className="flex-1">
        <Hero />
        <QuickSummary />
        <ProblemSolution />
        <HowItWorks />
        <Features />
        <Comparison />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
