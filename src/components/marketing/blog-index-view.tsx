"use client";

/** Índice do blog — chrome i18n + conteúdo server-rendered (BLUF por artigo). */
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, CalendarDays, Clock } from "lucide-react";

import type { BlogPost } from "@/content/types";
import { useAppLocale } from "@/i18n/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export function BlogIndexView({ posts }: { posts: BlogPost[] }) {
  const t = useTranslations("content");
  const { locale } = useAppLocale();

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-28 sm:px-6">
      {/* Cabeçalho + BLUF */}
      <header className="max-w-3xl">
        <Badge
          variant="outline"
          className="border-primary/30 bg-primary/5 text-xs font-semibold text-primary"
        >
          {t("blogTitle")}
        </Badge>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {t("blogH1")}
        </h1>
        <p className="mt-4 rounded-2xl border-l-4 border-primary bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("blogBluf")}
        </p>
      </header>

      {/* Lista de artigos */}
      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="hover-lift group flex flex-col overflow-hidden rounded-2xl border bg-card"
          >
            <Link href={`/blog/${post.slug}`} className="flex h-full flex-col" aria-label={post.title}>
              <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                <Image
                  src={post.image}
                  alt={post.imageAlt}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <Badge
                  variant="outline"
                  className="absolute left-3 top-3 border-white/20 bg-black/55 text-[11px] font-semibold text-white backdrop-blur"
                >
                  {post.section}
                </Badge>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h2 className="font-display text-lg font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
                  {post.h1}
                </h2>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {post.bluf}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" aria-hidden />
                    <time dateTime={post.modified}>{formatDate(post.modified, locale)}</time>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-3.5" aria-hidden />
                    {t("blogReadingTime", { minutes: post.readingMinutes })}
                  </span>
                </div>
                <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  {t("blogReadMore")}
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </div>
            </Link>
          </article>
        ))}
      </div>

      {/* CTA final */}
      <aside className="bg-brand-blue-deep mt-16 overflow-hidden rounded-3xl p-8 text-white sm:p-12 dark:bg-card dark:ring-1 dark:ring-border">
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-xl">
            <h2 className="font-display text-2xl font-bold tracking-tight">
              {t("blogCtaTitle")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/85 sm:text-base">
              {t("blogCtaText")}
            </p>
          </div>
          <Button size="lg" asChild className="min-h-12 bg-primary px-7 text-base font-semibold text-primary-foreground">
            <Link href="/#precos">{t("blogCtaButton")}</Link>
          </Button>
        </div>
      </aside>
    </div>
  );
}
