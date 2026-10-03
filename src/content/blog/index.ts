import type { ArticleMeta } from "@/lib/seo";
import type { BlogPost } from "../types";
import { post1 } from "./01-como-extrair-leads-google-maps";
import { post2 } from "./02-limite-120-resultados-quadtree";
import { post3 } from "./03-heat-score-classificar-leads";
import { post4 } from "./04-lgpd-extracao-dados-publicos";
import { post5 } from "./05-anti-bot-humanizacao-circuit-breaker";
import { post6 } from "./06-whatsapp-vendas-b2b";

/** Ordem = destaque no índice do blog. */
export const BLOG_POSTS: BlogPost[] = [post1, post2, post3, post4, post5, post6];

/** Conta palavras reais do artigo (BLUF, takeaways, seções, FAQ, resumo). */
export function countPostWords(post: BlogPost): number {
  const chunks: string[] = [
    post.h1,
    post.description,
    post.bluf,
    post.executiveSummary,
    ...post.keyTakeaways,
  ];
  for (const section of post.sections) {
    chunks.push(section.heading);
    chunks.push(...(section.paragraphs ?? []));
    if (section.callout) chunks.push(section.callout);
    if (section.list) chunks.push(...section.list.items);
    if (section.table) {
      if (section.table.caption) chunks.push(section.table.caption);
      chunks.push(...section.table.headers);
      for (const row of section.table.rows) chunks.push(...row);
    }
    if (section.faq) {
      for (const item of section.faq) chunks.push(item.q, item.a);
    }
  }
  return chunks
    .join(" ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Metadados para JSON-LD/sitemap — nunca falha (dados estáticos em código). */
export function getPostMetas(): ArticleMeta[] {
  return BLOG_POSTS.map((post) => ({
    slug: post.slug,
    title: post.title,
    description: post.description,
    image: post.image,
    imageAlt: post.imageAlt,
    published: post.published,
    modified: post.modified,
    locale: post.locale,
    keywords: post.keywords,
    wordCount: countPostWords(post),
    section: post.section,
    articleType: post.articleType,
    definedTerms: post.definedTerms,
  }));
}

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

/** Para generateStaticParams — build nunca depende de banco/IO externo. */
export function getPostSlugs(): string[] {
  return BLOG_POSTS.map((post) => post.slug);
}
