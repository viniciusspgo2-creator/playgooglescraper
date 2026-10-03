/**
 * FONTE ÚNICA DE VERDADE — identidade, URLs e sinais locais da marca.
 *
 * Todos os artefatos de SEO/GEO (metadata, canonical, Open Graph, JSON-LD,
 * sitemap, llms.txt) derivam daqui. Para evoluir a entidade da marca
 * (endereço completo, telefone, redes sociais), altere SOMENTE este arquivo.
 */
/** URL canônica SEM barra final (env APP_URL; local cai em localhost:3000). */
export const SITE_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export const SITE = {
  name: "Play Google Scraper",
  legalName: "Play Google Scraper",
  /** Frase-objetivo citável por LLMs (BLUF institucional). */
  description:
    "Plataforma SaaS brasileira com extensão Chrome (MV3) para prospecção de leads no Google Maps: extração em cascata payload→DOM, busca em grade Quadtree que supera o limite de ~120 resultados por consulta, classificação automática de leads por presença digital (heat score), Kanban de vendas e campanhas de WhatsApp com conformidade LGPD.",
  url: SITE_URL,
  defaultLocale: "pt-BR" as const,
  locales: ["pt-BR", "en-US", "es-ES"] as const,
  /** País da operação e área atendida (nível país — sem inventar endereço). */
  addressCountry: "BR",
  areaServed: ["BR", "PT"],
  /**
   * Perfis oficiais que ancoram a entidade no Knowledge Graph (sameAs).
   * Cadastre aqui as URLs REAIS dos perfis da marca; o JSON-LD inclui
   * sameAs apenas quando houver ao menos uma URL.
   */
  sameAs: [] as string[],
  logo: {
    url: "/brand/logo.png",
    width: 637,
    height: 673,
  },
  ogImage: {
    url: "/images/og-default.png",
    width: 1200,
    height: 630,
  },
  twitter: "@playgscraper",
  keywords: [
    "google maps scraper",
    "extrair leads do google maps",
    "extração de leads",
    "geração de leads b2b",
    "extensão chrome para prospecção",
    "leads sem site",
    "prospecção de clientes",
    "scraping google maps",
    "heat score leads",
    "campanhas whatsapp vendas",
  ],
  category: "business software",
} as const;

/** Versão do produto (JSON-LD SoftwareApplication) — manter em sincronia com package.json. */
export const SITE_VERSION = "1.0.0";

/** URL absoluta contra a base canônica (garante consistência sitemap/canonical/OG). */
export function absoluteUrl(pathname: string): string {
  const clean = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${SITE.url}${clean === "/" ? "" : clean}`;
}
