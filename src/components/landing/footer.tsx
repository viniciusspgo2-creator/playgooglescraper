"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Separator } from "@/components/ui/separator";

const PRODUCT_LINKS = [
  { href: "#recursos", key: "features" },
  { href: "#como-funciona", key: "howItWorks" },
  { href: "#precos", key: "pricing" },
  { href: "#faq", key: "faq" },
] as const;

/** Conteúdo (SEO/GEO) — rotas absolutas que funcionam de qualquer página. */
const CONTENT_LINKS = [
  { href: "/blog", key: "blog" },
  { href: "/glossario", key: "glossary" },
  { href: "/sobre", key: "about" },
] as const;

export function Footer() {
  const t = useTranslations("footer");
  const tNav = useTranslations("nav");
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <Image
                src="/brand/logo.png"
                alt=""
                width={30}
                height={30}
                className="size-8 rounded-lg object-contain"
              />
              <span className="font-display text-sm font-semibold text-foreground">
                Play Google Scraper
              </span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {t("tagline")}
            </p>
          </div>

          <nav aria-label={t("productTitle")}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {t("productTitle")}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {tNav(link.key)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label={t("contentTitle")}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {t("contentTitle")}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {CONTENT_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {tNav(link.key)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {t("legalTitle")}
            </h3>
            <p className="mt-4 max-w-sm text-xs leading-relaxed text-muted-foreground">
              {t("lgpd")}
            </p>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-muted-foreground">{t("rights", { year })}</p>
          <p className="text-xs text-muted-foreground">{t("disclaimer")}</p>
        </div>
      </div>
    </footer>
  );
}
