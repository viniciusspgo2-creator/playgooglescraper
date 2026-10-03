/**
 * Tipos do sistema de conteúdo (blog/glossário) — SEO + GEO.
 * Conteúdo é DADO tipado (não MDX, não fs): build estático à prova de banco vazio,
 * renderização SSR/SSG com HTML semântico pronto para crawlers e LLMs.
 */

/** Formatação inline suportada nos textos: [link](href), **negrito**, `código`. */
export type BlogSection = {
  /** Nível 2 = seção principal (H2); nível 3 = subseção (H3). */
  level: 2 | 3;
  /** Título com intenção conversacional quando aplicável ("O que é…", "Como funciona…"). */
  heading: string;
  paragraphs?: string[];
  list?: { items: string[]; ordered?: boolean };
  table?: { caption?: string; headers: string[]; rows: string[][] };
  /** Destaque semântico (blockquote) — definição citável. */
  callout?: string;
  /** Perguntas & respostas renderizadas como <details> + FAQPage JSON-LD. */
  faq?: { q: string; a: string }[];
};

export type BlogPost = {
  slug: string;
  title: string;
  /** H1 da página do artigo. */
  h1: string;
  /** Meta description (155–165 chars). */
  description: string;
  /** Resposta direta (BLUF — Bottom Line Up Front) logo sob o H1. */
  bluf: string;
  /** "Principais conclusões" — caixa de takeaways para RAG/síntese. */
  keyTakeaways: string[];
  /** Resumo executivo ao final do artigo. */
  executiveSummary: string;
  sections: BlogSection[];
  sources: { label: string; url: string }[];
  image: string;
  imageAlt: string;
  published: string;
  modified: string;
  locale: "pt-BR";
  keywords: string[];
  section: string;
  articleType: "Article" | "TechArticle";
  readingMinutes: number;
  /** IDs de termos do glossário relacionados (entity linking interno). */
  definedTerms: string[];
};

export type GlossaryTerm = {
  /** id do anchor (usado em glossario#id e no JSON-LD DefinedTerm). */
  id: string;
  name: string;
  /** Definição DIRETA e citável (1–3 frases, formato BLUF). */
  definition: string;
  /** Complemento prático (para quem é, como usar). */
  detail?: string;
  /** Termos relacionados (entity linking). */
  related: string[];
  /** Artigos do blog que aprofundam o termo. */
  posts: string[];
};
