"use client";

import { NextIntlClientProvider } from "next-intl";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LOCALE_COOKIE, type AppLocale } from "./config";
import enUS from "./messages/en-US.json";
import esES from "./messages/es-ES.json";
import ptBR from "./messages/pt-BR.json";

export type AppMessages = typeof ptBR;

const bundles: Record<AppLocale, AppMessages> = {
  "pt-BR": ptBR,
  "en-US": enUS as AppMessages,
  "es-ES": esES as AppMessages,
};

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function writeLocaleCookie(locale: AppLocale): void {
  // Persistência server + client (o SSR lê este cookie para metadata e locale inicial).
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;samesite=lax`;
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: AppLocale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.lang = locale;
    writeLocaleCookie(locale);
    // O título dinâmico só pertence à landing (rota "/"); páginas de conteúdo
    // (blog/glossário/sobre) definem seus próprios títulos SEO no servidor.
    if (pathname === "/") document.title = bundles[locale].meta.title;
  }, [locale, pathname]);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale }),
    [locale, setLocale]
  );

  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider
        locale={locale}
        messages={bundles[locale]}
        timeZone="America/Sao_Paulo"
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function useAppLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useAppLocale deve ser usado dentro de <LocaleProvider>");
  }
  return ctx;
}
