import { cookies } from "next/headers";
import type { Metadata } from "next";

import { getAuthContext } from "@/server/auth/guard";
import { RootExperience } from "@/components/app/root-experience";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";
import { getServerMessages } from "@/i18n/server";
import { LocaleProvider } from "@/i18n/provider";
import { JsonLd, buildMetadata, faqJsonLd, howToJsonLd } from "@/lib/seo";

/** SEO da home por idioma (cookie persistido, sem reload). */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const { messages, locale } = await getServerMessages();
    return buildMetadata({
      title: messages.meta.title,
      description: messages.meta.description,
      path: "/",
      locale,
    });
  } catch {
    return buildMetadata({
      title: "Play Google Scraper — Extraia leads do Google Maps em escala",
      description:
        "Plataforma SaaS multi-tenant com extensão Chrome para extração de leads do Google Maps.",
      path: "/",
    });
  }
}

const INVITE_RE = /^[a-f0-9]{16,128}$/;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  const { messages } = await getServerMessages();

  const params = await searchParams;
  const rawInvite = typeof params.invite === "string" ? params.invite : null;
  const inviteToken = rawInvite && INVITE_RE.test(rawInvite) ? rawInvite : null;

  // Sessão resolvida no servidor → shell começa na view correta (sem flash).
  const auth = await getAuthContext();

  // JSON-LD da home: FAQPage (8 perguntas do idioma ativo) + HowTo (3 passos).
  const faqItems = (messages.faq.items as Array<{ q: string; a: string }>).map((item) => ({
    q: item.q,
    a: item.a,
  }));

  const howSteps = (messages.how.steps as Array<{ title: string; text: string }>).map((step) => ({
    name: step.title,
    text: step.text,
  }));

  const jsonLd: Array<Record<string, unknown>> = [
    faqJsonLd(faqItems, locale),
  ];
  if (howSteps.length >= 2) {
    jsonLd.push(
      howToJsonLd({
        name: messages.how.title,
        description: messages.how.subtitle,
        steps: howSteps,
        locale,
      }),
    );
  }

  return (
    <>
      <JsonLd data={jsonLd} />
      <LocaleProvider initialLocale={locale}>
        <RootExperience initialSession={auth?.session ?? null} inviteToken={inviteToken} />
      </LocaleProvider>
    </>
  );
}
