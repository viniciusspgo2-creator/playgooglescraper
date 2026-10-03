"use client";

/** Glossário — definições citáveis (BLUF) + índice lateral + entity linking. */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, BookOpenText } from "lucide-react";

import type { GlossaryTerm } from "@/content/types";
import { useAppLocale } from "@/i18n/provider";
import { Badge } from "@/components/ui/badge";

export function GlossaryView({
  terms,
  posts,
}: {
  terms: GlossaryTerm[];
  /** slug → título real do artigo (resolvido no servidor). */
  posts: { slug: string; title: string }[];
}) {
  const t = useTranslations("content");
  const { locale } = useAppLocale();
  const dateFmt = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-28 sm:px-6">
      <header className="max-w-3xl">
        <Badge
          variant="outline"
          className="border-primary/30 bg-primary/5 text-xs font-semibold text-primary"
        >
          <BookOpenText className="mr-1.5 size-3.5" aria-hidden />
          {t("glossaryTitle")}
        </Badge>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {t("glossaryH1")}
        </h1>
        <p className="mt-4 rounded-2xl border-l-4 border-primary bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("glossaryBluf")}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("glossarySubtitle", { count: terms.length })} ·{" "}
          {dateFmt.format(new Date())}
        </p>
      </header>

      <div className="mt-12 grid gap-10 lg:grid-cols-[260px_1fr]">
        {/* Índice (Nesta página) */}
        <nav
          aria-label={t("glossaryOnThisPage")}
          className="hidden max-h-[70vh] self-start overflow-y-auto rounded-2xl border bg-card p-4 lg:sticky lg:top-24 lg:block"
        >
          <p className="text-xs font-bold uppercase tracking-wider text-foreground">
            {t("glossaryOnThisPage")}
          </p>
          <ul className="mt-3 space-y-1.5">
            {terms.map((term) => (
              <li key={term.id}>
                <a
                  href={`#${term.id}`}
                  className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {term.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Definições */}
        <div className="space-y-8">
          {terms.map((term) => (
            <section
              key={term.id}
              id={term.id}
              aria-labelledby={`${term.id}-name`}
              className="scroll-mt-24 rounded-2xl border bg-card p-6"
            >
              <h2
                id={`${term.id}-name`}
                className="font-display text-xl font-bold tracking-tight text-foreground"
              >
                {term.name}
              </h2>
              <p className="mt-3 rounded-xl border-l-4 border-primary bg-muted/40 p-4 text-sm leading-relaxed text-foreground sm:text-base">
                {term.definition}
              </p>
              {term.detail && (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{term.detail}</p>
              )}

              {(term.related.length > 0 || term.posts.length > 0) && (
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                  {term.related.length > 0 && (
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("glossaryRelated")}:
                      </span>
                      {term.related
                        .map((rel) => terms.find((candidate) => candidate.id === rel))
                        .filter((rel): rel is GlossaryTerm => Boolean(rel))
                        .map((rel) => (
                          <a
                            key={rel.id}
                            href={`#${rel.id}`}
                            className="rounded-full border bg-muted/40 px-2.5 py-1 font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                          >
                            {rel.name}
                          </a>
                        ))}
                    </p>
                  )}
                  {term.posts.length > 0 && (
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("glossaryDeepen")}:
                      </span>
                      {term.posts.map((slug) => {
                        const post = posts.find((candidate) => candidate.slug === slug);
                        if (!post) return null;
                        return (
                          <Link
                            key={slug}
                            href={`/blog/${slug}`}
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                          >
                            {post.title}
                            <ArrowRight className="size-3" aria-hidden />
                          </Link>
                        );
                      })}
                    </p>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
