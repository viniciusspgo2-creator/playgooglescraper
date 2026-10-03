"use client";

import { Menu, PanelLeftOpen } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "@/components/app/session";
import { LanguageSwitcher, ThemeToggle } from "@/components/shared/preferences";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { analyticsEvents } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "#recursos", key: "features" },
  { href: "#como-funciona", key: "howItWorks" },
  { href: "#precos", key: "pricing" },
  { href: "#faq", key: "faq" },
  // Conteúdo (SEO/GEO): rotas absolutas — funcionam da landing e do blog.
  { href: "/blog", key: "blog" },
  { href: "/glossario", key: "glossary" },
  { href: "/sobre", key: "about" },
] as const;

/** Âncoras só existem na landing; fora dela, viram links absolutos para /#… . */
function resolveHref(href: string, pathname: string): string {
  if (href.startsWith("/") || pathname === "/") return href;
  return `/${href}`;
}

export function Header() {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const { session, openAuth, setView } = useSession();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    // Checagem inicial fora do corpo síncrono do effect (rAF callback).
    const raf = requestAnimationFrame(onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "glass shadow-sm" : "bg-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <a
          href={pathname === "/" ? "#inicio" : "/"}
          className="flex items-center gap-2.5 rounded-md"
          aria-label={tCommon("brand")}
        >
          <Image
            src="/brand/logo.png"
            alt=""
            width={34}
            height={34}
            className="size-9 rounded-lg object-contain"
            priority
          />
          <span className="font-display text-[15px] font-semibold tracking-tight text-brand-blue-deep dark:text-foreground">
            Play Google Scraper
          </span>
        </a>

        <nav className="hidden items-center gap-1 md:flex" aria-label={tCommon("brand")}>
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={resolveHref(item.href, pathname)}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {t(item.key)}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <div className="hidden md:block">
            <LanguageSwitcher />
          </div>
          <ThemeToggle />
          {session ? (
            <Button
              onClick={() => {
                analyticsEvents.ctaClick("header_panel");
                setView("app");
              }}
              className="ml-1 hidden min-h-11 bg-primary px-5 text-primary-foreground shadow-sm transition-shadow hover:shadow-[0_8px_24px_rgba(255,107,26,0.35)] sm:inline-flex"
            >
              <PanelLeftOpen className="size-4" aria-hidden />
              {t("panel")}
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  analyticsEvents.ctaClick("header_login");
                  openAuth("login");
                }}
                className="hidden min-h-11 sm:inline-flex"
              >
                {t("login")}
              </Button>
              <Button
                onClick={() => {
                  analyticsEvents.ctaClick("header_start");
                  openAuth("signup");
                }}
                className="ml-1 hidden min-h-11 bg-primary px-5 text-primary-foreground shadow-sm transition-shadow hover:shadow-[0_8px_24px_rgba(255,107,26,0.35)] sm:inline-flex"
              >
                {t("start")}
              </Button>
            </>
          )}

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 md:hidden"
                aria-label={tCommon("openMenu")}
              >
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetTitle className="sr-only">{tCommon("brand")}</SheetTitle>
              <nav className="mt-8 flex flex-col gap-1" aria-label={tCommon("brand")}>
                {NAV_ITEMS.map((item) => (
                  <a
                    key={item.href}
                    href={resolveHref(item.href, pathname)}
                    onClick={() => setMenuOpen(false)}
                    className="min-h-11 rounded-md px-3 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    {t(item.key)}
                  </a>
                ))}
              </nav>
              <div className="mt-6 flex flex-col gap-3">
                <LanguageSwitcher mobile />
                {session ? (
                  <Button
                    onClick={() => {
                      setMenuOpen(false);
                      setView("app");
                    }}
                    className="min-h-11"
                  >
                    <PanelLeftOpen className="size-4" aria-hidden />
                    {t("panel")}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setMenuOpen(false);
                        openAuth("login");
                      }}
                      className="min-h-11"
                    >
                      {t("login")}
                    </Button>
                    <Button
                      onClick={() => {
                        setMenuOpen(false);
                        openAuth("signup");
                      }}
                      className="min-h-11"
                    >
                      {t("start")}
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
