import { cookies } from "next/headers";

import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/provider";
import { MarketingShell } from "@/components/marketing/marketing-shell";

/** Layout das páginas públicas de conteúdo — mesmo idioma sem recarga (cookie). */
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);

  return (
    <LocaleProvider initialLocale={locale}>
      <MarketingShell>{children}</MarketingShell>
    </LocaleProvider>
  );
}
