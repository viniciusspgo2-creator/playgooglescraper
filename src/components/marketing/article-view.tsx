"use client";

/** Artigo — HTML semântico (article, blockquote, table, details) + chrome i18n. */
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2, ExternalLink, ListChecks } from "lucide-react";

import type { BlogPost } from "@/content/types";
import { renderInline } from "@/components/marketing/rich-text";
import { useAppLocale } from "@/i18n/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export function ArticleView({
  post,
  terms,
}: {
  post: BlogPost;
  /** id → nome dos termos do glossário relacionados (resolvidos no servidor). */
  terms: { id: string; name: string }[];
}) {
  const t = useTranslations("content");
  const { locale } = useAppLocale();

  return (
    <article className="mx-auto max-w-4xl px-4 pb-20 pt-24 sm:px-6">
      {/* Cabeçalho do artigo */}
      <header>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 font-semibold text-primary">
            {post.section}
          </Badge>
          <time dateTime={post.published}>{t("blogPublished", { date: formatDate(post.published, locale) })}</time>
          <span aria-hidden>·</span>
          <time dateTime={post.modified}>{t("blogUpdated", { date: formatDate(post.modified, locale) })}</time>
          <span aria-hidden>·</span>
          <span>{t("blogReadingTime", { minutes: post.readingMinutes })}</span>
        </div>
        <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
          {post.h1}
        </h1>
        <p className="sr-only">{post.description}</p>

        <div className="relative mt-8 aspect-[16/9] overflow-hidden rounded-2xl border bg-muted">
          <Image
            src={post.image}
            alt={post.imageAlt}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 896px"
            className="object-cover"
          />
        </div>
      </header>

      {/* BLUF — resposta direta */}
      <aside
        aria-label={t("blogBlufLabel")}
        className="mt-8 rounded-2xl border-l-4 border-primary bg-muted/50 p-5"
      >
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          {t("blogBlufLabel")}
        </p>
        <p className="mt-2 text-base leading-relaxed text-foreground">{post.bluf}</p>
      </aside>

      {/* Key takeaways (RAG-friendly) */}
      <aside
        aria-label={t("blogTakeaways")}
        className="mt-6 rounded-2xl border bg-card p-5"
      >
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-foreground">
          <ListChecks className="size-4 text-primary" aria-hidden />
          {t("blogTakeaways")}
        </p>
        <ul className="mt-3 space-y-2.5">
          {post.keyTakeaways.map((takeaway) => (
            <li key={takeaway} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-closed" aria-hidden />
              <span>{renderInline(takeaway)}</span>
            </li>
          ))}
        </ul>
      </aside>

      {/* Corpo */}
      <div className="mt-10 space-y-10">
        {post.sections.map((section) => {
          const Heading = (section.level === 2 ? "h2" : "h3") as "h2" | "h3";
          return (
            <section key={section.heading}>
              <Heading
                className={
                  section.level === 2
                    ? "font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
                    : "font-display text-xl font-semibold tracking-tight text-foreground"
                }
              >
                {section.heading}
              </Heading>

              {section.paragraphs?.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 64)}
                  className="mt-4 text-base leading-relaxed text-muted-foreground"
                >
                  {renderInline(paragraph)}
                </p>
              ))}

              {section.callout && (
                <blockquote className="mt-5 rounded-r-2xl border-l-4 border-brand-blue bg-muted/40 p-4 text-sm italic leading-relaxed text-foreground sm:text-base">
                  {renderInline(section.callout)}
                </blockquote>
              )}

              {section.list && (
                section.list.ordered ? (
                  <ol className="mt-5 space-y-2.5 pl-5">
                    {section.list.items.map((item) => (
                      <li
                        key={item.slice(0, 64)}
                        className="list-decimal pl-1 text-sm leading-relaxed text-muted-foreground marker:font-semibold marker:text-primary sm:text-base"
                      >
                        {renderInline(item)}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <ul className="mt-5 space-y-2.5">
                    {section.list.items.map((item) => (
                      <li
                        key={item.slice(0, 64)}
                        className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground sm:text-base"
                      >
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        <span>{renderInline(item)}</span>
                      </li>
                    ))}
                  </ul>
                )
              )}

              {section.table && (
                <div className="mt-6 overflow-x-auto rounded-2xl border">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    {section.table.caption && (
                      <caption className="bg-muted/60 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {section.table.caption}
                      </caption>
                    )}
                    <thead>
                      <tr className="border-b bg-muted/40">
                        {section.table.headers.map((header) => (
                          <th
                            key={header}
                            scope="col"
                            className="px-4 py-3 text-left font-semibold text-foreground"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row) => (
                        <tr key={row.join("|").slice(0, 80)} className="border-b last:border-0">
                          {row.map((cell, ci) => (
                            <td
                              key={cell.slice(0, 64)}
                              className={
                                ci === 0
                                  ? "px-4 py-3 font-medium text-foreground"
                                  : "px-4 py-3 text-muted-foreground"
                              }
                            >
                              {renderInline(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {section.faq && (
                <Accordion type="single" collapsible className="mt-6">
                  {section.faq.map((item, i) => (
                    <AccordionItem key={item.q} value={`faq-${i}`}>
                      <AccordionTrigger className="text-left text-base font-semibold text-foreground">
                        {item.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                        {renderInline(item.a)}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </section>
          );
        })}
      </div>

      {/* Glossário relacionado (entity linking) */}
      {terms.length > 0 && (
        <nav aria-label={t("blogGlossary")} className="mt-12 rounded-2xl border bg-card p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-foreground">
            {t("blogGlossary")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {terms.map((term) => (
              <a
                key={term.id}
                href={`/glossario#${term.id}`}
                className="rounded-full border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                {term.name}
              </a>
            ))}
          </div>
        </nav>
      )}

      {/* Resumo executivo */}
      <aside aria-label={t("blogSummary")} className="mt-10 rounded-2xl bg-muted/40 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          {t("blogSummary")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {post.executiveSummary}
        </p>
      </aside>

      {/* Fontes */}
      <section aria-label={t("blogSources")} className="mt-10">
        <h2 className="font-display text-lg font-semibold text-foreground">{t("blogSources")}</h2>
        <ul className="mt-3 space-y-2">
          {post.sources.map((source) => (
            <li key={source.url} className="text-sm">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary"
              >
                {source.label}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 rounded-xl bg-muted/40 p-4 text-xs text-muted-foreground">
        {t("blogLangNotice")} · <Link href="/sobre" className="font-medium text-primary hover:underline">Play Google Scraper</Link>
      </p>

      {/* CTA */}
      <aside className="bg-brand-blue-deep mt-12 overflow-hidden rounded-3xl p-8 text-white dark:bg-card dark:ring-1 dark:ring-border">
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-xl">
            <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
              {t("blogCtaTitle")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/85">{t("blogCtaText")}</p>
          </div>
          <Button
            size="lg"
            asChild
            className="min-h-12 bg-primary px-7 text-base font-semibold text-primary-foreground"
          >
            <Link href="/#precos">
              {t("blogCtaButton")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </aside>

      <p className="mt-8">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          {t("blogBack")}
        </Link>
      </p>
    </article>
  );
}
