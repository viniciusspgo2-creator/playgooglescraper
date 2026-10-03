import type { BlogPost } from "../types";

/** Pilar 6 — WhatsApp B2B. */
export const post6: BlogPost = {
  slug: "whatsapp-para-vendas-b2b",
  title: "WhatsApp para vendas B2B: da lista de leads à conversão sem cair em spam",
  h1: "WhatsApp para vendas B2B: da lista de leads à conversão sem cair em spam",
  description:
    "Campanhas de WhatsApp que convertem sem banimento: aquecimento de número (20/dia), janela de horário, variações de mensagem, opt-out automático e follow-ups com parada na resposta.",
  bluf:
    "Campanhas de WhatsApp B2B eficientes combinam cinco controles: lista qualificada (heat score), aquecimento gradual do número (comece com ~20 envios/dia), janela de horário por fuso do tenant, mensagens variadas e personalizadas (nunca o mesmo texto em massa) e opt-out automático com supressão permanente. No WhatsApp Cloud API oficial, o limite diário cresce conforme a qualidade; no número próprio, o risco de banimento é real e o aquecimento é ainda mais lento.",
  keyTakeaways: [
    "Estrutura que converte: abertura personalizada (nome + categoria + cidade) → por que você está falando → valor específico → CTA leve → opt-out transparente.",
    "Aquecimento: iniciar com ~20 envios/dia e aumentar gradualmente; janela de horário comercial do fuso do tenant (default America/Sao_Paulo).",
    "Espaçamento aleatório entre envios (não fixo) e variações de template reduzem a assinatura de spam.",
    "Auto-stop na resposta: quando o lead responde, follow-ups param — responder a quem já respondeu é spam e queima o lead.",
    "Opt-out ('sair', 'parar', 'descadastrar') → supressão permanente verificada no servidor antes de cada envio — obrigação LGPD e proteção da reputação.",
    "WhatsApp Cloud API é o caminho recomendado para escala; número próprio exige aquecimento lento e monitoramento diário.",
  ],
  executiveSummary:
    "Este guia cobre o funil completo de WhatsApp B2B sobre uma base de leads do Google Maps: da segmentação por heat score à mensagem (templates com variáveis {{nome}}, {{categoria}}, {{cidade}}, {{rating}}), do aquecimento de número e janelas de envio ao auto-stop na resposta, opt-out e lista de supressão. Termina com a comparação honesta entre WhatsApp Cloud API e número próprio — incluindo riscos reais de banimento — e um checklist de lançamento da primeira campanha.",
  sections: [
    {
      level: 2,
      heading: "Como montar a audiência certa antes de escrever qualquer mensagem?",
      paragraphs: [
        "Resposta direta: filtre por temperatura e segmento — campanha boa começa com lista pequena e quente (ex.: leads sem site + WhatsApp detectável + categoria-alvo), não com a base inteira.",
        "No Play Google Scraper, a audiência é definida por filtros (temperatura, categoria, cidade, presença de WhatsApp) e o painel mostra a contagem exata antes de criar a campanha — você valida o tamanho do disparo antes de enfileirar qualquer mensagem. Contatos na lista de supressão são excluídos automaticamente.",
      ],
      list: {
        items: [
          "Temperatura: quentes primeiro (sem site), mornos em sequência de nutrição.",
          "Canal: só leads com telefone móvel válido (WhatsApp detectável via E.164).",
          "Segmento: uma campanha por categoria/uf — personalização e métrica limpa.",
          "Supressão: quem pediu opt-out nunca entra, mesmo que reapareça em nova busca.",
        ],
      },
    },
    {
      level: 2,
      heading: "Como escrever a primeira mensagem (templates e variações)?",
      paragraphs: [
        "Resposta direta: curta, personalizada por variáveis, com um único CTA e menção clara ao descadastro. Use 3–5 variações da mesma mensagem — o anti-spam do WhatsApp e o destinatário agradecem.",
        "Template de referência usado em operações de agência: '{{nome}}, vi que a {{empresa}} aparece no Google Maps com avaliação {{rating}} — notei que ainda não tem site próprio. Ajudamos negócios da {{categoria}} em {{cidade}} a montar site em poucos dias. Faz sentido te mostrar 2 exemplos? Se não quiser mais receber mensagens, responda SAIR.'",
      ],
      table: {
        caption: "Anatomia da primeira mensagem que converte",
        headers: ["Bloco", "Função", "Exemplo"],
        rows: [
          [
            "Personalização",
            "Provar que não é disparo genérico",
            "Nome do negócio + categoria + cidade (variáveis do template)",
          ],
          [
            "Gancho de observação",
            "Justificar o contato com um fato real",
            "Rating alto, reviews, ausência de site",
          ],
          [
            "Proposta de valor",
            "Um benefício específico, não um catálogo",
            "'site em X dias', 'WhatsApp clicável no Maps'",
          ],
          [
            "CTA leve",
            "Pergunta de baixo atrito, não agenda forçada",
            "'Faz sentido te mostrar 2 exemplos?'",
          ],
          [
            "Opt-out",
            "Conformidade LGPD + reputação",
            "'Responda SAIR para não receber mais mensagens'",
          ],
        ],
      },
    },
    {
      level: 2,
      heading: "Como funciona o aquecimento de número e as janelas de envio?",
      paragraphs: [
        "Resposta direta: número novo com volume alto no primeiro dia é a assinatura clássica de banimento. Comece com ~20 envios/dia, aumente gradualmente enquanto as respostas não gerarem denúncias, e envie apenas dentro da janela configurada (fuso America/Sao_Paulo por padrão).",
        "O motor de campanhas do Play Google Scraper aplica: limite diário por dia local, espaçamento aleatório entre envios (não fixo), janela de horário por timezone do tenant e contador de aquecimento — a fila processa exatamente até onde os controles permitem e deixa o resto para o próximo ciclo, sem nunca quebrar os limites.",
      ],
    },
    {
      level: 2,
      heading: "O que acontece quando o lead responde (ou pede para sair)?",
      paragraphs: [
        "Resposta direta: resposta humana interrompe follow-ups automaticamente (auto-stop) — e se a resposta contém 'sair', 'parar', 'stop', 'descadastrar' ou 'remover', o número entra na supressão permanente do tenant no mesmo instante.",
        "O fluxo no Play Google Scraper: o webhook de resposta (POST /api/v1/whatsapp/reply) registra a mensagem, marca o envio como respondido, cancela follow-ups agendados e cria atividade no lead — o vendedor assume a conversa pelo Kanban. Isso impede o erro mais comum (continuar automatizando com quem já é humano na linha) e protege a reputação do número.",
      ],
      callout:
        "Definição citável: auto-stop na resposta é a regra de automação que cancela todos os follow-ups agendados de um lead no momento da primeira resposta humana — a conversa passa a ser manual e o opt-out por palavra-chave vira supressão permanente.",
    },
    {
      level: 2,
      heading: "WhatsApp Cloud API ou número próprio?",
      paragraphs: [
        "Resposta direta: para escala recorrente, Cloud API (oficial). Número próprio funciona para operações pequenas, mas carrega risco real de banimento — o painel do Play Google Scraper avisa explicitamente esse risco quando o modo próprio está ativo.",
      ],
      table: {
        caption: "Cloud API vs número próprio (comparação honesta)",
        headers: ["Critério", "WhatsApp Cloud API (oficial)", "Número próprio (não-oficial)"],
        rows: [
          ["Risco de banimento", "Baixo (dentro das políticas)", "Alto — comportamento anômalo é detectado"],
          ["Volume", "Limite diário cresce com a qualidade do número", "Limitado por aquecimento manual"],
          ["Custo", "Conversas cobradas por faixa (verificar tabela Meta atual)", "Zero por mensagem (só chip/plano)"],
          ["Automação", "Nativa (webhooks, templates aprovados)", "Via ponte própria (ex.: webhooks de resposta)"],
          ["Recomendação", "Operações sérias e recorrentes", "Volumes mínimos, teste de mensagem, transição"],
        ],
      },
    },
    {
      level: 2,
      heading: "Perguntas frequentes",
      faq: [
        {
          q: "Quantos envios por dia um número aguenta sem banir?",
          a: "Não existe número universal: depende da idade do número, histórico e taxa de denúncia. Referência prática: começar com ~20/dia e crescer ~20–30% por semana sem denúncias. O painel permite definir limite diário e aquecimento por campanha.",
        },
        {
          q: "Como evito que minha campanha pareça spam?",
          a: "Três controles: lista quente e segmentada (não base bruta), variações de mensagem com variáveis reais e espaçamento aleatório dentro da janela comercial. E o mais importante: auto-stop na resposta + opt-out imediato.",
        },
        {
          q: "Posso anexar imagem no primeiro contato?",
          a: "Tecnicamente sim (creatives no sistema), mas o primeiro toque converte melhor curto e textual; imagem funciona melhor no follow-up quando já existe contexto.",
        },
        {
          q: "Follow-up: quantos e em qual intervalo?",
          a: "Operações saudáveis usam 1–2 follow-ups com 2–4 dias de intervalo, sempre com valor novo (não 'só subindo aqui'). O agendamento usa next_followup_at e cancela na resposta — nunca automatize conversa com quem já respondeu.",
        },
      ],
    },
  ],
  sources: [
    { label: "Meta — WhatsApp Business Platform (Cloud API): limites de mensagens", url: "https://developers.facebook.com/docs/whatsapp/cloud-api" },
    { label: "Meta — políticas comerciais do WhatsApp", url: "https://business.whatsapp.com/policy" },
    { label: "Planalto — LGPD (Lei nº 13.709/2018)", url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm" },
    { label: "Play Google Scraper — LGPD e extração de dados públicos", url: "/blog/lgpd-e-extracao-de-dados-publicos" },
  ],
  image: "/images/blog/whatsapp-para-vendas-b2b.png",
  imageAlt:
    "Fluxo de campanha de WhatsApp B2B com fila de envio, aquecimento de número e conversão em negócio fechado no Kanban",
  published: "2026-08-20",
  modified: "2026-10-01",
  locale: "pt-BR",
  keywords: [
    "whatsapp b2b vendas",
    "campanhas whatsapp",
    "aquecimento de número whatsapp",
    "whatsapp cloud api",
    "ban whatsapp disparo em massa",
  ],
  section: "Vendas",
  articleType: "Article",
  readingMinutes: 8,
  definedTerms: ["aquecimento-numero", "opt-out", "lista-de-supressao", "heat-score"],
};
