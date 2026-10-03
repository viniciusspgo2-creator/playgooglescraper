/**
 * Helpers Enterprise de SEO/GEO — usados por TODAS as páginas públicas.
 *
 * - buildMetadata: title, description, canonical ABSOLUTO, robots, OG, Twitter,
 *   keywords, alternates — com valores coerentes entre si (nunca URLs em conflito).
 * - Fábricas JSON-LD: Organization, WebSite, WebPage, BreadcrumbList, FAQPage,
 *   HowTo, Service, SoftwareApplication, Article/TechArticle, DefinedTermSet,
 *   AboutPage — todos resolvidos contra SITE.url para consistência total.
 */
import type { Metadata } from "next";

import { SITE, SITE_VERSION, absoluteUrl } from "@/lib/site";

const OG_LOCALE: Record<string, string> = {
  "pt-BR": "pt_BR",
  "en-US": "en_US",
  "es-ES": "es_ES",
};

export type BuildMetadataInput = {
  title: string;
  description: string;
  /** Caminho canônico começando com "/" (ex.: "/blog/artigo"). */
  path: string;
  keywords?: string[];
  /** Imagem OG específica (caminho público); default = OG institucional. */
  image?: { url: string; width: number; height: number; alt: string };
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  /** true em páginas utilitárias que não devem entrar no índice. */
  noindex?: boolean;
  locale?: string;
};

export function buildMetadata({
  title,
  description,
  path,
  keywords,
  image,
  type = "website",
  publishedTime,
  modifiedTime,
  noindex = false,
  locale = SITE.defaultLocale,
}: BuildMetadataInput): Metadata {
  const og = image ?? {
    url: SITE.ogImage.url,
    width: SITE.ogImage.width,
    height: SITE.ogImage.height,
    alt: `${SITE.name} — ${title}`,
  };
  const canonical = path === "/" ? "/" : path;

  return {
    title,
    description,
    keywords: keywords ? [...keywords] : [...SITE.keywords],
    alternates: { canonical },
    robots: noindex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
          },
        },
    openGraph: {
      type,
      url: absoluteUrl(canonical),
      title,
      description,
      siteName: SITE.name,
      locale: OG_LOCALE[locale] ?? "pt_BR",
      images: [{ url: og.url, width: og.width, height: og.height, alt: og.alt }],
      ...(type === "article" && publishedTime ? { publishedTime } : {}),
      ...(type === "article" && modifiedTime ? { modifiedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [og.url],
      site: SITE.twitter,
      creator: SITE.twitter,
    },
  };
}

/* ════════════════════════════ JSON-LD ════════════════════════════ */

export type JsonLdObject = Record<string, unknown>;

/** Organization + entidade da marca (com Service embutido e sameAs opcional). */
export function organizationJsonLd(locale: string = SITE.defaultLocale): JsonLdObject {
  const graph: JsonLdObject[] = [
    {
      "@type": "Organization",
      "@id": absoluteUrl("/#organization"),
      name: SITE.name,
      legalName: SITE.legalName,
      url: SITE.url,
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl(SITE.logo.url),
        width: SITE.logo.width,
        height: SITE.logo.height,
      },
      description: SITE.description,
      foundingLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressCountry: SITE.addressCountry,
        },
      },
      areaServed: SITE.areaServed.map((code) => ({
        "@type": "Country",
        name: code,
      })),
      ...(SITE.sameAs.length > 0 ? { sameAs: SITE.sameAs } : {}),
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        availableLanguage: ["pt-BR", "en-US", "es-ES"],
        url: absoluteUrl("/sobre"),
      },
    },
    {
      "@type": "WebSite",
      "@id": absoluteUrl("/#website"),
      url: SITE.url,
      name: SITE.name,
      description: SITE.description,
      inLanguage: locale,
      publisher: { "@id": absoluteUrl("/#organization") },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: absoluteUrl("/blog?q={search_term_string}"),
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": absoluteUrl("/#software"),
      name: SITE.name,
      softwareVersion: SITE_VERSION,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Lead Generation Software",
      operatingSystem: "Chrome (extensão MV3)",
      url: SITE.url,
      description: SITE.description,
      inLanguage: SITE.locales,
      publisher: { "@id": absoluteUrl("/#organization") },
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "BRL",
        lowPrice: "97",
        highPrice: "497",
        offerCount: 3,
      },
      featureList: [
        "Extração de leads do Google Maps em cascata payload→DOM",
        "Busca em grade Quadtree que supera o limite de ~120 resultados por consulta",
        "Classificação automática de leads (heat score 0–100)",
        "Filtro de leads sem website (máxima intenção de compra de site/leads quentes)",
        "Kanban de vendas com arrastar-e-soltar e trilha de auditoria",
        "Campanhas de WhatsApp com fila, aquecimento e lista de supressão",
        "API v1 com tokens (pgs_live_) e webhooks assinados por HMAC",
        "Multi-tenant com isolamento por tenant_id verificado por testes",
      ],
    },
    {
      "@type": "Service",
      "@id": absoluteUrl("/#service"),
      name: `${SITE.name} — Prospecção de leads no Google Maps`,
      serviceType: "Geração de leads B2B / Software de prospecção",
      provider: { "@id": absoluteUrl("/#organization") },
      areaServed: SITE.areaServed.map((code) => ({ "@type": "Country", name: code })),
      audience: {
        "@type": "Audience",
        audienceType:
          "Agências, consultorias, imobiliárias, clínicas e times comerciais que prospectam negócios locais",
      },
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "Planos do Play Google Scraper",
        itemListElement: [
          { "@type": "Offer", name: "Starter", price: "97", priceCurrency: "BRL" },
          { "@type": "Offer", name: "Pro", price: "197", priceCurrency: "BRL" },
          { "@type": "Offer", name: "Business", price: "497", priceCurrency: "BRL" },
        ],
      },
    },
  ];

  return { "@context": "https://schema.org", "@graph": graph };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function webPageJsonLd(input: {
  name: string;
  description: string;
  path: string;
  locale?: string;
  breadcrumbId?: string;
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": absoluteUrl(input.path),
    url: absoluteUrl(input.path),
    name: input.name,
    description: input.description,
    inLanguage: input.locale ?? SITE.defaultLocale,
    isPartOf: { "@id": absoluteUrl("/#website") },
    ...(input.breadcrumbId ? { breadcrumb: { "@id": input.breadcrumbId } } : {}),
  };
}

export function faqJsonLd(items: { q: string; a: string }[], locale: string = SITE.defaultLocale): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: locale,
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function howToJsonLd(input: {
  name: string;
  description: string;
  steps: { name: string; text: string }[];
  locale?: string;
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: input.name,
    description: input.description,
    inLanguage: input.locale ?? SITE.defaultLocale,
    step: input.steps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

export type ArticleMeta = {
  slug: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  published: string;
  modified: string;
  locale: string;
  keywords: string[];
  wordCount: number;
  section: string;
  /** "TechArticle" para conteúdo de engenharia; "Article" para negócio. */
  articleType: "Article" | "TechArticle";
  /** IDs de termos do glossário relacionados (ancoragem de entidades). */
  definedTerms?: string[];
};

export function articleJsonLd(post: ArticleMeta): JsonLdObject {
  const url = absoluteUrl(`/blog/${post.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": post.articleType,
    "@id": url,
    url,
    headline: post.title,
    description: post.description,
    inLanguage: post.locale,
    datePublished: post.published,
    dateModified: post.modified,
    wordCount: post.wordCount,
    articleSection: post.section,
    keywords: post.keywords,
    author: { "@id": absoluteUrl("/#organization") },
    publisher: { "@id": absoluteUrl("/#organization") },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: {
      "@type": "ImageObject",
      url: absoluteUrl(post.image),
      caption: post.imageAlt,
    },
    isPartOf: { "@id": absoluteUrl("/#website") },
    ...(post.definedTerms && post.definedTerms.length > 0
      ? { about: post.definedTerms.map((id) => ({ "@id": absoluteUrl(`/glossario#${id}`) })) }
      : {}),
  };
}

export function definedTermSetJsonLd(
  terms: { id: string; name: string; description: string }[],
): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": absoluteUrl("/glossario#termset"),
    name: `Glossário técnico — ${SITE.name}`,
    description:
      "Definições curtas e citáveis dos termos centrais de prospecção no Google Maps, extração de dados e automação de vendas.",
    inLanguage: SITE.defaultLocale,
    hasDefinedTerm: terms.map((term) => ({
      "@type": "DefinedTerm",
      "@id": absoluteUrl(`/glossario#${term.id}`),
      name: term.name,
      description: term.description,
      url: absoluteUrl(`/glossario#${term.id}`),
      inDefinedTermSet: { "@id": absoluteUrl("/glossario#termset") },
    })),
  };
}

export function aboutPageJsonLd(locale: string = SITE.defaultLocale): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": absoluteUrl("/sobre"),
    url: absoluteUrl("/sobre"),
    name: `Sobre o ${SITE.name}`,
    inLanguage: locale,
    isPartOf: { "@id": absoluteUrl("/#website") },
    mainEntity: { "@id": absoluteUrl("/#organization") },
  };
}

/** Componente server-side para qualquer bloco JSON-LD. */
export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify já escapa "</script" via unicode; safe para Google/AI crawlers.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
