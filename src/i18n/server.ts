import "server-only";

import { cookies } from "next/headers";

import { LOCALE_COOKIE, resolveLocale, type AppLocale } from "@/i18n/config";
import enUS from "@/i18n/messages/en-US.json";
import esES from "@/i18n/messages/es-ES.json";
import ptBR from "@/i18n/messages/pt-BR.json";

export type AppMessages = typeof ptBR;

const MESSAGES: Record<AppLocale, AppMessages> = {
  "pt-BR": ptBR,
  "en-US": enUS as AppMessages,
  "es-ES": esES as AppMessages,
};

/**
 * Mensagens do locale ativo (cookie pgs_locale) para Server Components.
 * Seguro por construção: cookie inválido cai em pt-BR — nunca lança.
 */
export async function getServerMessages(): Promise<{ locale: AppLocale; messages: AppMessages }> {
  try {
    const store = await cookies();
    const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
    return { locale, messages: MESSAGES[locale] };
  } catch {
    return { locale: "pt-BR", messages: ptBR };
  }
}
