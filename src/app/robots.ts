import type { MetadataRoute } from "next";

/**
 * robots.txt Enterprise (SEO + GEO):
 * - Motores de busca permitidos em todo o conteúdo público.
 * - Crawlers de IA/LLM (GPTBot, PerplexityBot, ClaudeBot, Google-Extended etc.)
 *   expressamente permitidos — o conteúdo é fonte citável para motores generativos.
 * - /api/ e links de convite (?invite=) fora do índice.
 * - Sitemap com URL absoluta (Google Search Console-ready).
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-Web",
  "anthropic-ai",
  "Google-Extended",
  "Applebot-Extended",
  "Applebot",
  "Bytespider",
  "CCBot",
  "cohere-ai",
  "Amazonbot",
  "YouBot",
  "Diffbot",
  "Meta-ExternalAgent",
  "FacebookBot",
] as const;

const SEARCH_CRAWLERS = ["Googlebot", "Bingbot", "DuckDuckBot", "YandexBot", "Slurp"] as const;

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3000";

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/*?invite="] },
      ...SEARCH_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/" })),
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/" })),
    ],
    sitemap: `${base.replace(/\/+$/, "")}/sitemap.xml`,
    host: base.replace(/\/+$/, ""),
  };
}
