import type { Metadata } from "next";

import { AboutView } from "@/components/marketing/about-view";
import { getServerMessages } from "@/i18n/server";
import { JsonLd, aboutPageJsonLd, breadcrumbJsonLd, buildMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { messages, locale } = await getServerMessages();
    return buildMetadata({
      title: messages.content.aboutH1,
      description: messages.content.aboutBluf,
      path: "/sobre",
      keywords: [
        "sobre play google scraper",
        "quem somos",
        "plataforma de prospecção",
        "geração de leads Brasil",
      ],
      locale,
    });
  } catch {
    return buildMetadata({
      title: "Sobre",
      description: "Sobre o Play Google Scraper.",
      path: "/sobre",
    });
  }
}

export default function AboutPage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Início", path: "/" },
    { name: "Sobre", path: "/sobre" },
  ]);

  return (
    <>
      <JsonLd data={[breadcrumb, aboutPageJsonLd()]} />
      <AboutView />
    </>
  );
}
