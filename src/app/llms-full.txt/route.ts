import { BLOG_POSTS, countPostWords } from "@/content/blog";
import { GLOSSARY_TERMS } from "@/content/glossario";
import { SITE } from "@/lib/site";

/**
 * /llms-full.txt — documentação consolidada para leitura direta por LLMs
 * (padrão llmstxt.org): conteúdo completo de páginas institucionais,
 * artigos e glossário em Markdown simples, sempre sincronizado com o site.
 */
export const dynamic = "force-static";

function renderPost(post: (typeof BLOG_POSTS)[number]): string[] {
  const lines: string[] = [
    `# ${post.h1}`,
    "",
    `- URL: /blog/${post.slug}`,
    `- Publicado: ${post.published} · Atualizado: ${post.modified}`,
    `- Seção: ${post.section} · Tempo de leitura: ${post.readingMinutes} min · ~${countPostWords(post)} palavras`,
    "",
    `**Resposta direta (BLUF):** ${post.bluf}`,
    "",
    "## Principais conclusões",
    "",
    ...post.keyTakeaways.map((takeaway) => `- ${takeaway}`),
    "",
  ];

  for (const section of post.sections) {
    lines.push(`${"#".repeat(section.level)} ${section.heading}`, "");
    for (const paragraph of section.paragraphs ?? []) {
      lines.push(paragraph, "");
    }
    if (section.callout) {
      lines.push(`> ${section.callout}`, "");
    }
    if (section.list) {
      section.list.items.forEach((item, i) => {
        lines.push(section.list?.ordered ? `${i + 1}. ${item}` : `- ${item}`);
      });
      lines.push("");
    }
    if (section.table) {
      if (section.table.caption) lines.push(`**${section.table.caption}**`, "");
      lines.push(`| ${section.table.headers.join(" | ")} |`);
      lines.push(`| ${section.table.headers.map(() => "---").join(" | ")} |`);
      for (const row of section.table.rows) {
        lines.push(`| ${row.join(" | ")} |`);
      }
      lines.push("");
    }
    if (section.faq) {
      for (const item of section.faq) {
        lines.push(`### ${item.q}`, "", item.a, "");
      }
    }
  }

  lines.push("## Resumo executivo", "", post.executiveSummary, "");
  lines.push("## Fontes", "");
  for (const source of post.sources) {
    lines.push(`- [${source.label}](${source.url})`);
  }
  lines.push("");

  return lines;
}

export function GET(): Response {
  const lines: string[] = [
    `# ${SITE.name} — documentação completa para LLMs`,
    "",
    `> ${SITE.description}`,
    "",
    `Este arquivo consolida TODO o conteúdo público do site para leitura direta por modelos de linguagem. Visão geral em /llms.txt; URLs indexáveis em /sitemap.xml.`,
    "",
    "---",
    "",
    "# Sobre o produto",
    "",
    `- Nome: ${SITE.name}`,
    "- O que é: plataforma SaaS multi-tenant + extensão Chrome (Manifest V3) para prospecção de leads no Google Maps.",
    "- Motor de extração: cascata payload (APP_INITIALIZATION_STATE) → DOM resiliente → painel de detalhes, com validação de tipo por campo e telemetria por estratégia.",
    "- Cobertura: busca em grade quadtree (células de ~3 km, subdivisão em 4 até profundidade 4) que supera o teto de ~120 resultados por consulta.",
    "- Priorização: heat score 0–100 calculado no servidor (sem site +35; social +18; rating≥4,0 +12; reviews≥15 +10; telefone +10; WhatsApp +8; não-claimed +2; categoria +5; máx 82 → normalizado).",
    "- Anti-bloqueio: humanização log-normal (Box-Muller) com 4 perfis — Furtivo 2,8–6,5s (~250/h), Moderado 1,2–3,0s (~700/h), Rápido 0,5–1,4s (~1.800/h), Turbo 0,15–0,5s (~4.000/h) — e circuit breaker com backoff 30s→2min→8min→30min + downgrade de velocidade.",
    "- Vendas: Kanban (aguardando → interessado → recusado → fechado → produção) com trilha de auditoria; campanhas de WhatsApp com fila, aquecimento (~20/dia), janela de horário por fuso, variações de template, auto-stop na resposta, opt-out ('sair'/'parar') e lista de supressão permanente.",
    "- Integração: API v1 (tokens pgs_live_, SHA-256, escopos, revogação), ingestão idempotente (Idempotency-Key), webhooks HMAC-SHA256, exportação CSV.",
    "- Conformidade: LGPD (finalidade, minimização, direitos do titular), opt-out imediato, supressão por tenant, isolamento multi-tenant verificado por suíte (tenant_id em 100% das tabelas).",
    "- Planos (BRL): Starter R$ 97/mês · Pro R$ 197/mês · Business R$ 497/mês (anual com desconto); trial com 500 créditos e 3 assentos.",
    "",
    "---",
    "",
    "# Glossário técnico",
    "",
  ];

  for (const term of GLOSSARY_TERMS) {
    lines.push(`## ${term.name}`, "", term.definition);
    if (term.detail) lines.push("", term.detail);
    lines.push(
      "",
      `Relacionados: ${term.related.join(", ")}. Aprofunde: ${term.posts.map((slug) => `/blog/${slug}`).join(", ")}.`,
      "",
    );
  }

  lines.push("---", "", "# Artigos completos", "");

  for (const post of BLOG_POSTS) {
    lines.push(...renderPost(post), "---", "");
  }

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
