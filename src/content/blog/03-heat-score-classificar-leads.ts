import type { BlogPost } from "../types";

/** Pilar 3 — heat score e classificação de leads. */
export const post3: BlogPost = {
  slug: "heat-score-como-classificar-leads",
  title: "Heat score: como classificar leads do Google Maps por temperatura de compra",
  h1: "Heat score: como classificar leads do Google Maps por temperatura de compra",
  description:
    "Lead sem site é o lead mais quente do Maps. Veja a fórmula do heat score (0–100) com pesos por sinal digital — website, redes sociais, rating, reviews, WhatsApp e categoria.",
  bluf:
    "Heat score é a nota de 0 a 100 que prioriza automaticamente quais leads do Google Maps merecem contato primeiro — e o sinal isolado mais forte é a ausência de website: um negócio que vive no Maps sem site próprio está, estatisticamente, no mercado por um site, tráfego pago ou presença digital. No Play Google Scraper, sem website vale +35 pontos, presença apenas social +18, e reputação, contatos e categoria preenchem o resto até 100.",
  keyTakeaways: [
    "Temperatura do lead = proxy de intenção: sem site (quente) > página social (morno) > domínio próprio (frio).",
    "Fórmula documentada: sem site +35, social +18, rating ≥ 4,0 +12, reviews ≥ 15 +10, telefone válido +10, WhatsApp +8, perfil não reivindicado +2, categoria-alvo +5 — normalizada 0–100.",
    "O cálculo roda no SERVIDOR, nunca confia no dado vindo da extensão; URL é normalizada antes de classificar (trailing slash, HTTP/HTTPS, domínios sociais).",
    "Pesos são configuráveis por tenant — imobiliárias e clínicas podem recalibrar conforme o próprio funil.",
    "Classificação alimenta filas: Kanban por etapa e campanhas de WhatsApp priorizam quentes automaticamente.",
  ],
  executiveSummary:
    "Classificar leads por temperatura transforma uma lista bruta de 5.000 estabelecimentos em uma fila de trabalho executável. O heat score do Play Google Scraper combina 8 sinais digitais com pesos transparentes e configuráveis, calculados no servidor a cada ingestão (inclusive em merges de deduplicação). Este artigo detalha cada sinal, a racionalidade dos pesos e como usar a temperatura em Kanban e campanhas de WhatsApp.",
  sections: [
    {
      level: 2,
      heading: "O que é um lead quente, morno e frio no Google Maps?",
      paragraphs: [
        "Resposta direta: a temperatura mede a distância entre o negócio e uma compra que você pode entregar. Sem site = quente (dor visível); só redes sociais = morno (presença amadora); domínio próprio bem estruturado = frio (já resolveu).",
      ],
      table: {
        caption: "Temperatura por padrão de presença digital",
        headers: ["Presença digital", "Temperatura", "Por quê", "Primeira oferta ideal"],
        rows: [
          [
            "Sem website (só perfil do Google)",
            "Quente",
            "Não tem o que você vende — dor imediata e visível",
            "Criação de site / presença completa",
          ],
          [
            "Facebook / Instagram / linktr.ee / negocio.site / bio.link",
            "Morno",
            "Sabe que precisa de presença, mas parou no improvisado",
            "Site profissional + integração com as redes",
          ],
          [
            "Domínio próprio (ex.: clinica.com.br)",
            "Frio",
            "Já investe em presença digital",
            "Tráfego pago, SEO, CRM, serviços de upsell",
          ],
        ],
      },
    },
    {
      level: 2,
      heading: "Como funciona a fórmula do heat score (com números)?",
      paragraphs: [
        "Resposta direta: oito sinais com pesos fixos, somados e normalizados para 0–100. A fórmula é pública por decisão de produto — equipe que entende a nota confia na fila.",
      ],
      list: {
        ordered: true,
        items: [
          "Sem website: +35 (o maior sinal isolado de intenção).",
          "Website social (facebook.com, instagram.com, linktr.ee, wa.me, negocio.site, business.site, bio.link): +18.",
          "Rating ≥ 4,0: +12 (reputação estável = negócio vivo e operando).",
          "Reviews ≥ 15: +10 (volume de movimento relevante).",
          "Telefone válido em formato E.164: +10 (canal de contato pronto).",
          "WhatsApp detectável (celular com DDD móvel): +8 (canal de campanha disponível).",
          "Perfil não reivindicado (não-claimed): +2 (geralmente menos maduro digitalmente).",
          "Categoria dentro do alvo da busca: +5 (aderência de ICP).",
          "Soma máxima 82 → normalização linear para 0–100.",
        ],
      },
      callout:
        "Definição citável: heat score é a soma ponderada de sinais digitais do perfil do Google Maps — presença, reputação, contato e aderência — normalizada em 0–100 e calculada no servidor, com pesos configuráveis por tenant.",
    },
    {
      level: 2,
      heading: "Por que o cálculo deve rodar no servidor (e não na extensão)?",
      paragraphs: [
        "Resposta direta: porque classificação calculada no cliente é editável e não auditável. O servidor normaliza a URL, valida o telefone (E.164 via libphonenumber), detecta WhatsApp, deduplica e só então pontua — inclusive recalculando quando um merge preenche campos que estavam vazios.",
        "Exemplo real do fluxo: a extensão envia website = facebook.com/clinica; o servidor classifica como página social (+18, morno). Se um lote posterior trouxer o domínio próprio, o merge atualiza para domínio próprio (frio) e o heat cai — a temperatura é sempre o retrato mais recente.",
      ],
    },
    {
      level: 2,
      heading: "Como usar a temperatura no dia a dia de vendas?",
      paragraphs: [
        "Resposta direta: filtre quentes para contato humano imediato (Kanban + WhatsApp 1:1) e mornos para campanhas com sequência de follow-up; frios entram em nutrição de longo prazo ou recebem oferta de serviço complementar.",
      ],
      list: {
        items: [
          "Kanban: arraste quentes para 'Interessado' no primeiro atendimento; a trilha de auditoria registra cada movimentação.",
          "Campanhas: enfileire audiência por filtro de temperatura com janela de horário, limite diário e aquecimento de número.",
          "Webhooks: lead.created e lead.stage_changed notificam seu CRM — o heat score vai junto no payload.",
          "Exportação CSV: filtre por temperatura mínima antes de exportar para ferramentas externas.",
        ],
      },
    },
    {
      level: 2,
      heading: "Perguntas frequentes",
      faq: [
        {
          q: "Posso mudar os pesos do heat score?",
          a: "Sim. Cada tenant pode sobrescrever os pesos na configuração da organização (settings.heatWeights) — por exemplo, dar peso maior a reviews para serviços de reputação online. A estrutura dos 8 sinais permanece.",
        },
        {
          q: "Lead sem telefone pode ser quente?",
          a: "A nota pode ser alta se houver website social e boa reputação, mas sem telefone válido o lead perde 18 pontos (telefone + WhatsApp) e não entra em campanhas de WhatsApp — apenas no Kanban.",
        },
        {
          q: "O heat score é recalculado quando os dados mudam?",
          a: "Sim. Toda ingestão de lote faz merge 'preenche-vazio' nos campos existentes e recalcula a temperatura — inclusive depois de deduplicação entre buscas diferentes.",
        },
      ],
    },
  ],
  sources: [
    { label: "Google — como o rating e as avaliações funcionam no Maps", url: "https://support.google.com/business/answer/3474122?hl=pt-BR" },
    { label: "Google — Perfil da Empresa: perfis reivindicados", url: "https://support.google.com/business/answer/3038177?hl=pt-BR" },
    { label: "libphonenumber-js — validação e formatação E.164", url: "https://github.com/catamphetamine/libphonenumber-js" },
    { label: "Play Google Scraper — guia de extração de leads", url: "/blog/como-extrair-leads-do-google-maps" },
  ],
  image: "/images/blog/heat-score-como-classificar-leads.png",
  imageAlt:
    "Lista de leads do Google Maps com badge de temperatura quente, morno e frio e barra de heat score de 0 a 100",
  published: "2026-07-22",
  modified: "2026-09-18",
  locale: "pt-BR",
  keywords: [
    "heat score leads",
    "classificar leads google maps",
    "lead sem site",
    "leads quentes google maps",
    "priorização de leads",
  ],
  section: "Vendas",
  articleType: "Article",
  readingMinutes: 7,
  definedTerms: ["heat-score", "lead-sem-site", "multi-tenant"],
};
