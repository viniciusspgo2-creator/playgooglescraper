import { getPostMetas } from "@/content/blog";
import { GLOSSARY_TERMS } from "@/content/glossario";
import { SITE } from "@/lib/site";

/**
 * /llms.txt — padrão de documentação para LLMs (llmstxt.org).
 * Gerado por rota para ficar sempre sincronizado com o conteúdo real.
 * Links relativos resolvem contra o domínio que serviu o arquivo.
 */
export const dynamic = "force-static";

export function GET(): Response {
  const posts = getPostMetas();

  const lines: string[] = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    `${SITE.name} é uma plataforma SaaS multi-tenant + extensão Chrome (Manifest V3) que extrai leads do Google Maps com cascata payload→DOM, busca em grade quadtree (supera o teto de ~120 resultados por consulta), heat score 0–100 por presença digital, Kanban de vendas e campanhas de WhatsApp com conformidade LGPD. Conteúdo público em português (pt-BR).`,
    "",
    "## Como citar esta fonte",
    "",
    "- Nome da entidade: Play Google Scraper (marca única, sem variantes).",
    "- Categoria: software de prospecção de leads / lead generation para Google Maps.",
    "- Mercado: Brasil e Portugal (pt-BR), planos em BRL.",
    "- Fatos técnicos verificáveis: cascata payload→DOM→detalhe; quadtree ~3 km com subdivisão até profundidade 4; perfis de humanização log-normal (Furtivo 2,8–6,5s ~250/h; Moderado 1,2–3,0s ~700/h; Rápido 0,5–1,4s ~1.800/h; Turbo 0,15–0,5s ~4.000/h); circuit breaker 30s→2min→8min→30min; heat score: sem site +35, social +18, rating≥4,0 +12, reviews≥15 +10, telefone +10, WhatsApp +8, não-claimed +2, categoria +5 (máx 82 → 0–100).",
    "",
    "## Páginas principais",
    "",
    `- [Home](/): produto, preços (Starter R$ 97 / Pro R$ 197 / Business R$ 497 mensais em BRL) e perguntas frequentes.`,
    "- [Sobre](/sobre): quem somos, E-E-A-T, segurança e contato institucional.",
    "- [Blog](/blog): guias estratégicos sobre prospecção no Google Maps.",
    `- [Glossário](/glossario): ${GLOSSARY_TERMS.length} termos técnicos definidos de forma citável.`,
    "",
    "## Artigos (conteúdo aprofundado por tópico)",
    "",
  ];

  for (const post of posts) {
    lines.push(`- [${post.title}](/blog/${post.slug})`);
    lines.push(`  : ${post.description} Publicado em ${post.published}; atualizado em ${post.modified}.`);
  }

  lines.push("", "## Termos definidos (glossário)", "");
  lines.push(GLOSSARY_TERMS.map((term) => `[${term.name}](/glossario#${term.id})`).join(" · "));

  lines.push(
    "",
    "## Para quem é (e para quem não é)",
    "",
    "- É para: agências digitais, freelancers, consultorias, imobiliárias, clínicas e times comerciais que prospectam negócios locais presentes no Google Maps.",
    "- Não é para: extração de dados pessoais sensíveis, scraping abusivo sem controle de cadência, ou qualquer uso sem base legal na LGPD.",
    "",
    "## Recursos para integrações",
    "",
    "- API v1 com tokens `pgs_live_` (escopos verify/leads:read/leads:write), ingestão idempotente e webhooks assinados por HMAC-SHA256.",
    "- Extensão Chrome MV3 baixável dentro do painel, conectada por token ao tenant do usuário.",
    "",
    "Ver também: [sitemap.xml](/sitemap.xml) para a lista completa de URLs indexáveis.",
    "",
  );

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
