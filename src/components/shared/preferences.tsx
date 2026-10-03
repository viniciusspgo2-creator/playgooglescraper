"use client";

/**
 * Preferências compartilhadas entre landing e workspace: idioma e tema.
 * O idioma persiste no cookie (todos) e em users.locale (quando logado) —
 * spec: troca sem reload persistida em user.locale.
 */
import { Check, Globe, Languages, MoonStar, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import { useSession } from "@/components/app/session";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { locales, localeLabels, type AppLocale } from "@/i18n/config";
import { useAppLocale } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations("language");
  const { locale, setLocale } = useAppLocale();
  const { session } = useSession();

  function change(next: AppLocale): void {
    setLocale(next);
    if (session) {
      // Persistência no perfil do usuário (fire-and-forget; cookie já persiste).
      void fetch("/api/auth/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      }).catch(() => undefined);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 gap-2 text-muted-foreground"
          aria-label={t("label")}
        >
          <Languages className="size-4" aria-hidden />
          <span className="hidden sm:inline">{localeLabels[locale]}</span>
          <span className="sm:hidden">{locale.split("-")[0]?.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn(mobile && "w-56")}>
        <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
        {locales.map((l: AppLocale) => (
          <DropdownMenuItem
            key={l}
            onClick={() => change(l)}
            className="min-h-11 cursor-pointer"
            aria-current={l === locale}
          >
            <span className="flex-1">{localeLabels[l]}</span>
            {l === locale && <Check className="size-4 text-primary" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeToggle() {
  const t = useTranslations("theme");
  const { setTheme } = useTheme();

  // Ícone e checks resolvidos via CSS (dark:) — sem estado de mount,
  // sem mismatch de hidratação e sem setState em effect.
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 text-muted-foreground"
          aria-label={t("toggle")}
        >
          <Sun className="size-[18px] dark:hidden" aria-hidden />
          <MoonStar className="hidden size-[18px] dark:inline-block" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("toggle")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("light")} className="min-h-11 cursor-pointer">
          <Sun className="size-4" aria-hidden /> {t("light")}
          <Check className="ml-auto size-4 text-primary dark:hidden" aria-hidden />
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} className="min-h-11 cursor-pointer">
          <MoonStar className="size-4" aria-hidden /> {t("dark")}
          <Check className="ml-auto hidden size-4 text-primary dark:inline-block" aria-hidden />
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} className="min-h-11 cursor-pointer">
          <Globe className="size-4" aria-hidden /> {t("system")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
