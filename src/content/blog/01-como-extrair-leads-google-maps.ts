import type { BlogPost } from "../types";

/** Pilar 1 — guia completo de extração de leads no Google Maps. */
export const post1: BlogPost = {
  slug: "como-extrair-leads-do-google-maps",
  title: "Como extrair leads do Google Maps em 2026: métodos, riscos e pipeline completo",
  h1: "Como extrair leads do Google Maps em 2026: métodos, riscos e pipeline completo",
  description:
    "Guia técnico: os 4 métodos de extrair leads do Google Maps, por que a busca simples trava em ~120 resultados, como funciona a cascata payload→DOM e o pipeline até o WhatsApp.",
  bluf:
    "A forma mais confiável de extrair leads do Google Maps em 2026 é ler o payload de dados que o próprio Maps embute na página (APP_INITIALIZATION_STATE), com validação por campo e fallback para o DOM — dentro de uma extensão Chrome rodando na sessão real do operador. Buscas simples truncam em ~120 resultados por consulta; para cobertura real de uma cidade, use busca em grade (quadtree). Este guia compara os métodos, mostra os riscos e desenha o pipeline completo até o contato.",
  keyTakeaways: [
    "Existem 4 métodos de extração (manual, API oficial, SaaS em nuvem, extensão no navegador) — cada um com trade-offs claros de custo, escala e risco.",
    "Toda consulta do Google Maps retorna no máximo ~120 resultados; grade quadtree subdivide a região em células de ~3 km para cobrir 100% da área.",
    "Ler o payload embutido (APP_INITIALIZATION_STATE) é mais estável do que seletores CSS; valide cada campo e registre a estratégia usada.",
    "Deduplicação por place_id + CID e ingestão idempotente (Idempotency-Key) evitam bases duplicadas quando a rede falha no meio do envio.",
    "Classifique leads por presença digital: negócio sem site é o lead de maior intenção para agências e prestadores de serviço.",
    "Dados públicos não isentam da LGPD: documente finalidade, ofereça opt-out imediato e mantenha lista de supressão.",
  ],
  executiveSummary:
    "Extrair leads do Google Maps de forma profissional exige resolver três problemas ao mesmo tempo: cobertura (grade quadtree contra o teto de ~120 resultados), estabilidade (cascata payload→DOM→detalhe com validação por campo) e conformidade (LGPD, opt-out e supressão). O pipeline recomendado é: definir a região e a categoria, extrair com extensão MV3 na sessão real do navegador, ingerir via API idempotente com deduplicação por place_id, classificar por heat score no servidor e trabalhar o contato por Kanban e campanhas de WhatsApp com aquecimento de número.",
  sections: [
    {
      level: 2,
      heading: "Quais são os métodos para extrair leads do Google Maps?",
      paragraphs: [
        "Resposta direta: hoje existem quatro caminhos — copiar manualmente, usar a API oficial de Places, contratar um serviço em nuvem (scrapers headless) ou rodar uma extensão de navegador na sua própria sessão. A escolha muda o custo por mil leads, o teto de cobertura e o risco de bloqueio.",
      ],
      table: {
        caption: "Comparativo dos métodos de extração de leads do Google Maps",
        headers: ["Método", "Custo típico", "Cobertura", "Risco de bloqueio", "Indicado para"],
        rows: [
          [
            "Cópia manual",
            "R$ 0 (mas horas de trabalho)",
            "Dezenas de registros",
            "Nenhum",
            "Validar um nicho pontual",
          ],
          [
            "API oficial (Places)",
            "USD por chamada (preços variam por campo/região)",
            "Média (depende de text search e paginação)",
            "Nenhum (dentro dos ToS)",
            "Produtos que precisam de dados licenciados",
          ],
          [
            "SaaS/headless em nuvem",
            "Assinatura + proxies",
            "Alta, mas compartilhada entre clientes",
            "Médio-alto (IPs de datacenter são sinalizados)",
            "Volumes pontuais sem equipe técnica",
          ],
          [
            "Extensão no navegador real",
            "Assinatura fixa",
            "Alta (com grade quadtree)",
            "Baixo (sessão autêntica do Chrome)",
            "Prospecção contínua por agências e times comerciais",
          ],
        ],
      },
    },
    {
      level: 2,
      heading: "Por que a extensão no navegador real vence em risco/benefício?",
      paragraphs: [
        "Resposta direta: o anti-abuse do Google observa a reputação da sessão. Um Chrome logado, com histórico real e interação humanizada, é estatisticamente mais parecido com o uso legítimo do que um datacenter headless com milhares de requisições idênticas.",
      ],
    },
    {
      level: 2,
      heading: "Por que a busca simples trava em ~120 resultados?",
      paragraphs: [
        "Resposta direta: porque o Google Maps pagina no máximo cerca de 120 lugares por consulta — carregar mais é fisicamente impossível na UI, não importa quanto você role.",
        "A consequência prática: buscar 'restaurantes em São Paulo' devolve uma amostra, não o mercado. A solução é dividir a bounding-box da região em células de aproximadamente 3 km e pesquisar célula por célula. Quando uma célula atinge o limite, ela é subdividida em quatro (quadtree) até a profundidade máxima (4 níveis cobrem até metrópoles inteiras).",
      ],
      list: {
        ordered: true,
        items: [
          "Defina a bounding-box da cidade ou desenhe a área no mapa (ou informe CEP/endereço — geocodificação via OpenStreetMap/Nominatim).",
          "Navegue para cada célula com /maps/search/<termo>/@LAT,LNG,15z.",
          "Se a célula retornar ≥ 100–120 resultados, subdivida em 4 subcélulas e repita.",
          "Deduque por place_id + CID a cada célula — regiões vizinhas sempre se sobrepõem.",
          "Persista o status de cada célula para retomar a busca depois de qualquer interrupção.",
        ],
      },
    },
    {
      level: 2,
      heading: "Como ler os dados de um lugar sem depender de classes CSS?",
      paragraphs: [
        "Resposta direta: leia primeiro o payload embutido na página — a variável global `APP_INITIALIZATION_STATE`, um JSON prefixado por )]}' com nome, telefone, website, rating, reviews, coordenadas e categorias de cada lugar. Se o campo não passar na validação de tipo, caia para seletores resilientes do DOM e, por último, para o painel de detalhes.",
        "Essa cascata (payload → DOM → detalhe) existe porque o Google altera índices internos do payload e classes CSS sem aviso. A regra de ouro: **nunca confie em um índice fixo solto** — faça busca recursiva validada por campo (texto, número, array) e registre qual estratégia forneceu cada dado.",
      ],
      callout:
        "Definição citável: cascata de extração é a estratégia em camadas payload → DOM → detalhe, com validação de tipo por campo e telemetria de qual camada forneceu cada dado — o que torna a quebra de layout detectável por métrica antes de virar incidente.",
    },
    {
      level: 2,
      heading: "Como evitar leads duplicados e perdas quando a rede falha?",
      paragraphs: [
        "Resposta direta: deduplicação composta (tenant + place_id) no banco e ingestão idempotente via header `Idempotency-Key` derivado do conteúdo do lote.",
        "Em produção real, a conexão cai no meio do envio de um lote de 25 leads. Sem idempotência, você reenvia e duplica; com idempotência, o servidor reconhece a chave e responde com o resultado original. O Play Google Scraper implementa as duas camadas: dedup dentro do lote (pre-flight), dedup contra a base por (tenant, place_id) e replay seguro de lotes.",
      ],
      list: {
        items: [
          "Dedup pré-envio: o mesmo place_id nunca entra duas vezes no mesmo lote.",
          "Dedup de base: unicidade composta (tenant_id, place_id) no banco.",
          "Idempotency-Key: hash do lote enviado como header — reenvio não reprocessa.",
          "Merge inteligente: se o lead já existe, campos vazios são preenchidos e o heat score recalculado.",
        ],
      },
    },
    {
      level: 2,
      heading: "Como classificar os leads extraídos por prioridade de contato?",
      paragraphs: [
        "Resposta direta: heat score calculado no servidor — negócio **sem website** é o lead mais quente para agências e prestadores (dor visível e imediata), seguido de quem usa apenas página social (Facebook, Instagram, linktr.ee).",
        "No Play Google Scraper a fórmula soma: sem site +35, presença social +18, rating ≥ 4,0 +12, reviews ≥ 15 +10, telefone válido +10, WhatsApp detectável +8, perfil não reivindicado +2 e categoria-alvo +5 — normalizada para 0–100. Pesos são configuráveis por tenant.",
      ],
    },
    {
      level: 2,
      heading: "O que a LGPD exige de quem prospecta com dados públicos?",
      paragraphs: [
        "Resposta direta: dado público não dispensa base legal. Documente a finalidade (prospecção B2B), minimize os campos, ofereça descadastro imediato em toda mensagem e mantenha lista de supressão verificada no servidor antes de cada envio.",
        "O pipeline do Play Google Scraper já nasce com opt-out automático ('sair', 'parar', 'descadastrar' interrompem o envio na hora), supressão permanente por tenant e trilha de auditoria de todas as operações sobre leads.",
      ],
    },
    {
      level: 2,
      heading: "Perguntas frequentes",
      faq: [
        {
          q: "Extrair leads do Google Maps é legal?",
          a: "Coletar dados públicos de empresas (razão social, telefone comercial, endereço) é prática aceita, desde que respeitados os Termos de Serviço, a LGPD e o direito de oposição do titular. Dados pessoais exigem base legal, finalidade declarada e canal de descadastro. Nunca venda dados pessoais sem base legal e evite volumes que caracterizem scraping abusivo.",
        },
        {
          q: "Quantos leads consigo extrair por hora?",
          a: "Depende do perfil de humanização: no Play Google Scraper, Furtivo extrai ~250 leads/h (2,8–6,5s entre ações), Moderado ~700/h, Rápido ~1.800/h e Turbo ~4.000/h. O limite real de cobertura vem da grade quadtree, não da velocidade.",
        },
        {
          q: "Preciso de proxy para usar a extensão?",
          a: "Não. A extensão roda na sua sessão real do Chrome, com a sua conexão — o que reduz drasticamente o risco comparado a proxies de datacenter. O circuit breaker pausa e desacelera automaticamente se houver qualquer sinal de bloqueio.",
        },
        {
          q: "Os leads extraídos entram direto no meu CRM?",
          a: "Entram no painel do Play Google Scraper (Kanban, filtros, campanhas) e podem sair via exportação CSV, webhooks assinados (lead.created, lead.stage_changed) ou API v1 — integração direta com o seu CRM.",
        },
      ],
    },
  ],
  sources: [
    { label: "Google Maps Platform — Places API (dados e limites oficiais)", url: "https://developers.google.com/maps/documentation/places/web-service/overview" },
    { label: "Chrome for Developers — Manifest V3", url: "https://developer.chrome.com/docs/extensions/develop/concepts/mv3-overview" },
    { label: "Planalto — Lei nº 13.709/2018 (LGPD)", url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm" },
    { label: "Play Google Scraper — ADR do motor de extração (cascata e quadtree)", url: "/blog/limite-de-120-resultados-google-maps" },
  ],
  image: "/images/blog/como-extrair-leads-do-google-maps.png",
  imageAlt:
    "Painel de prospecção com mapa do Google Maps, células de grade quadtree e lista de leads extraídos com temperatura e heat score",
  published: "2026-07-08",
  modified: "2026-09-22",
  locale: "pt-BR",
  keywords: [
    "como extrair leads do google maps",
    "google maps scraper",
    "extração de leads google maps",
    "gerador de leads b2b",
    "extensão chrome leads",
    "scraping google maps legal",
  ],
  section: "Prospecção",
  articleType: "Article",
  readingMinutes: 9,
  definedTerms: ["cascata-extracao", "quadtree-grid-search", "place-id", "heat-score", "lgpd"],
};
