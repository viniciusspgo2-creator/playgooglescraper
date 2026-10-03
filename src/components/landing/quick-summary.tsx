"use client";

/**
 * Bloco BLUF da landing — respostas diretas e citáveis (GEO) visíveis no HTML.
 * Renderiza as 4 perguntas-resposta do namespace content.quickItems.
 */
import { useTranslations } from "next-intl";
import { MessageCircleQuestion } from "lucide-react";

import { Reveal } from "./reveal";

export function QuickSummary() {
  const t = useTranslations("content");
  const items = t.raw("quickItems") as { q: string; a: string }[];

  return (
    <section id="resumo" aria-label={t("quickTitle")} className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="rounded-3xl border bg-card p-6 sm:p-10">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
              <MessageCircleQuestion className="size-4" aria-hidden />
              {t("quickTitle")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              {t("quickSubtitle")}
            </p>
          </div>

          <dl className="mt-8 grid gap-5 md:grid-cols-2">
            {items.map((item, i) => (
              <Reveal key={item.q} delay={i * 0.06}>
                <div className="h-full rounded-2xl border bg-muted/30 p-5">
                  <dt className="font-display text-base font-semibold text-foreground">
                    {item.q}
                  </dt>
                  <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
