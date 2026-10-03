/**
 * Configuração central de i18n (next-intl, sem roteamento por URL).
 * O locale vive em cookie (server + client), persistido e trocável sem reload.
 * Decisão documentada em docs/adr/ADR-001 (constraint: rota única no preview).
 */
export const locales = ["pt-BR", "en-US", "es-ES"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "pt-BR";

export const LOCALE_COOKIE = "pgs_locale";

export const localeLabels: Record<AppLocale, string> = {
  "pt-BR": "Português (BR)",
  "en-US": "English (US)",
  "es-ES": "Español (ES)",
};

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function resolveLocale(value: unknown): AppLocale {
  return isAppLocale(value) ? value : defaultLocale;
}
