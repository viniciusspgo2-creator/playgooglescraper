import type { GlossaryTerm } from "./types";

/**
 * Glossário técnico (GEO) — definições curtas, diretas e citáveis por LLMs.
 * Cada termo vira um DefinedTerm no JSON-LD de /glossario e ancora de
 * entity-linking para os artigos.
 */
export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    id: "heat-score",
    name: "Heat score",
    definition:
      "Heat score é uma nota de 0 a 100 que mede a probabilidade de um lead do Google Maps comprar a primeira solução do funil do concorrente — geralmente um site ou presença digital profissional. No Play Google Scraper, um lead sem website começa em 35 pontos, ganha 18 se usa página social (Facebook/Instagram/linktr.ee) e até 47 pontos adicionais por reputação, contato e categoria.",
    detail:
      "A pontuação é calculada no SERVIDOR (nunca confia em dados da extensão) e aceita pesos customizados por tenant via configuração. Leads quentes priorizam o contato; leads frios alimentam campanhas de longo prazo.",
    related: ["lead", "lead-sem-site", "multi-tenant"],
    posts: ["heat-score-como-classificar-leads", "como-extrair-leads-do-google-maps"],
  },
  {
    id: "lead-sem-site",
    name: "Lead sem site",
    definition:
      "Lead sem site é um negócio encontrado no Google Maps que não possui website próprio — usa apenas o perfil do Google ou páginas sociais. É o segmento de maior intenção de compra no mercado de criação de sites e serviços digitais, porque a ausência do site é uma dor imediata e visível.",
    related: ["heat-score", "place-id"],
    posts: ["heat-score-como-classificar-leads", "como-extrair-leads-do-google-maps"],
  },
  {
    id: "place-id",
    name: "Place ID",
    definition:
      "Place ID é o identificador único que o Google atribui a um estabelecimento no Google Maps (formato tipo ChIJ…). É a chave usada para deduplicação de leads: o mesmo place_id nunca é importado duas vezes dentro do mesmo tenant.",
    detail:
      "Em conjunto com o CID (identificador de negócio do Google), garante que buscas repetidas, células sobrepostas ou retomadas de fila não gerem contatos duplicados.",
    related: ["cid", "quadtree-grid-search", "idempotencia"],
    posts: ["limite-de-120-resultados-google-maps", "como-extrair-leads-do-google-maps"],
  },
  {
    id: "cid",
    name: "CID (Google)",
    definition:
      "CID é o identificador numérico interno do Google para um negócio listado no Maps. É usado como chave complementar de deduplicação ao place_id, cobrindo casos em que o mesmo estabelecimento aparece em consultas diferentes.",
    related: ["place-id", "deduplicacao"],
    posts: ["limite-de-120-resultados-google-maps"],
  },
  {
    id: "deduplicacao",
    name: "Deduplicação de leads",
    definition:
      "Deduplicação é o processo que impede o mesmo lead de entrar duas vezes na base. No Play Google Scraper ela é composta: dentro do lote (pre-flight), contra a base por (tenant, place_id) e reforçada por headers Idempotency-Key nas chamadas da API.",
    related: ["place-id", "idempotencia", "cid"],
    posts: ["como-extrair-leads-do-google-maps"],
  },
  {
    id: "cascata-extracao",
    name: "Cascata de extração (payload → DOM → detalhe)",
    definition:
      "Cascata de extração é a estratégia em três camadas para ler dados de um lugar no Google Maps: primeiro o payload embutido na página (APP_INITIALIZATION_STATE), depois seletores resilientes do DOM e por fim o painel de detalhes aberto sob demanda. Cada campo tem validação por tipo (Zod) e cai para a camada seguinte quando falha.",
    detail:
      "Cada lead registrado carrega a fonte de cada campo (payload, dom ou detail) e o sucesso por estratégia alimenta telemetria agregada — quando o Google muda o layout, o decaimento aparece nas métricas antes de virar incidente.",
    related: ["app-initialization-state", "mv3", "quadtree-grid-search"],
    posts: [
      "como-extrair-leads-do-google-maps",
      "limite-de-120-resultados-google-maps",
      "anti-bot-humanizacao-e-circuit-breaker",
    ],
  },
  {
    id: "app-initialization-state",
    name: "APP_INITIALIZATION_STATE",
    definition:
      "APP_INITIALIZATION_STATE é a variável global onde o Google Maps embute o payload de dados da página — um JSON prefixado por )]}' que contém nome, telefone, website, rating, reviews, coordenadas e categorias de cada lugar. Ler esse payload é mais estável do que depender de classes CSS, que mudam com frequência.",
    detail:
      "Os índices internos do payload mudam entre versões (ex.: [14][11] para nome), por isso a leitura correta usa busca recursiva com validação de tipo por campo — nunca índice fixo solto.",
    related: ["cascata-extracao", "mv3"],
    posts: ["como-extrair-leads-do-google-maps", "limite-de-120-resultados-google-maps"],
  },
  {
    id: "quadtree-grid-search",
    name: "Quadtree Grid Search",
    definition:
      "Quadtree Grid Search é a técnica que supera o teto de ~120 resultados por consulta do Google Maps: uma bounding-box é dividida em células de ~3 km, cada célula é pesquisada de forma independente e, quando uma célula atinge o limite, ela é subdividida em quatro (até profundidade 4). O resultado é cobertura completa da área em vez de uma amostra truncada.",
    detail:
      "As células ficam persistidas com status, profundidade e contagem de resultados — buscas interrompidas são retomadas exatamente onde pararam, e o progresso é calculado como células concluídas sobre o total.",
    related: ["place-id", "cascata-extracao", "mv3"],
    posts: ["limite-de-120-resultados-google-maps", "como-extrair-leads-do-google-maps"],
  },
  {
    id: "circuit-breaker",
    name: "Circuit breaker",
    definition:
      "Circuit breaker é o mecanismo que pausa a extração automaticamente quando o Google sinaliza bloqueio (CAPTCHA, redirecionamento para /sorry/index ou HTTP 429) e aplica pausas exponenciais de 30s → 2min → 8min → 30min com downgrade de um nível de velocidade.",
    detail:
      "O objetivo é preservar a sessão do navegador real do operador: em vez de insistir contra o anti-abuse e perder a conta/proxy, o sistema espera, reduz a agressividade e retoma a fila de onde parou.",
    related: ["humanizacao-log-normal", "rate-limit", "cascata-extracao"],
    posts: ["anti-bot-humanizacao-e-circuit-breaker"],
  },
  {
    id: "humanizacao-log-normal",
    name: "Humanização log-normal",
    definition:
      "Humanização log-normal é a modelagem dos tempos de espera e dos movimentos do mouse com distribuição log-normal (via Box-Muller), em vez de intervalos fixos — o padrão estatístico que mais se aproxima do comportamento humano real e o mais difícil de distinguir por heurísticas anti-bot.",
    detail:
      "No Play Google Scraper existem quatro perfis: Furtivo (2,8–6,5s, ~250 leads/h), Moderado (1,2–3,0s, ~700/h), Rápido (0,5–1,4s, ~1.800/h) e Turbo (0,15–0,5s, ~4.000/h). O scroll usa easing cúbico e o movimento do cursor, interpolação Bézier com overshoot.",
    related: ["circuit-breaker", "cascata-extracao"],
    posts: ["anti-bot-humanizacao-e-circuit-breaker"],
  },
  {
    id: "rate-limit",
    name: "Rate limit",
    definition:
      "Rate limit é o limite de requisições por janela de tempo aplicado a uma API para proteger o serviço e a experiência de todos os clientes. Na API v1 do Play Google Scraper, a ingestão de leads aceita 120 requisições/minuto por token e a verificação de token, 60/minuto — excedentes recebem HTTP 429 com cabeçalhos de retry.",
    related: ["idempotencia", "api-token"],
    posts: ["anti-bot-humanizacao-e-circuit-breaker", "como-extrair-leads-do-google-maps"],
  },
  {
    id: "api-token",
    name: "Token de API (pgs_live_)",
    definition:
      "Token de API é a credencial que conecta a extensão ao painel. No Play Google Scraper o token tem formato pgs_live_<tenant>_<64 hex>, é exibido uma única vez no momento da criação e apenas o SHA-256 é armazenado no servidor — além de escopos (verify, leads:read, leads:write), revogação imediata e registro de último uso.",
    related: ["multi-tenant", "rate-limit", "webhook"],
    posts: ["como-extrair-leads-do-google-maps"],
  },
  {
    id: "idempotencia",
    name: "Idempotência",
    definition:
      "Idempotência é a garantia de que repetir a mesma operação não duplica o efeito. Na ingestão de leads, cada lote viaja com um header Idempotency-Key derivado do conteúdo (hash dos place_ids) — se a rede cair após o envio, o reenvio não cria leads repetidos; o servidor responde com o resultado original.",
    related: ["deduplicacao", "rate-limit"],
    posts: ["como-extrair-leads-do-google-maps", "anti-bot-humanizacao-e-circuit-breaker"],
  },
  {
    id: "multi-tenant",
    name: "Multi-tenant",
    definition:
      "Multi-tenant é a arquitetura em que múltiplos clientes (tenants) compartilham a mesma aplicação e banco com isolamento lógico rigoroso: toda tabela de negócio carrega tenant_id, toda consulta é filtrada por esse escopo e a unicidade dos leads é composta (tenant, place_id) — um tenant nunca lê ou escreve dados de outro.",
    detail:
      "No Play Google Scraper o isolamento é garantido por uma camada de guard no ORM que injeta e valida o tenant em todas as operações, e provado por suíte de verificação executada por tabela.",
    related: ["api-token", "heat-score"],
    posts: ["como-extrair-leads-do-google-maps"],
  },
  {
    id: "webhook",
    name: "Webhook",
    definition:
      "Webhook é a notificação HTTP automática que o Play Google Scraper envia ao sistema do cliente quando eventos acontecem (lead.created, lead.stage_changed, campaign.reply), assinada com HMAC-SHA256 no cabeçalho X-PGS-Signature para verificação de autenticidade.",
    detail:
      "Entregas falhas seguem backoff exponencial (30s → 2min → 8min → 30min) com até 5 tentativas e reenvio manual pelo painel.",
    related: ["api-token", "multi-tenant"],
    posts: ["como-extrair-leads-do-google-maps"],
  },
  {
    id: "mv3",
    name: "Manifest V3 (MV3)",
    definition:
      "Manifest V3 é a plataforma atual de extensões do Chrome: service worker no lugar do background persistente, side panel como interface lateral e permissões mínimas declaradas. Toda extensão publicada na Chrome Web Store precisa ser MV3 — a do Play Google Scraper é nativa nessa plataforma.",
    related: ["cascata-extracao", "quadtree-grid-search"],
    posts: ["como-extrair-leads-do-google-maps", "limite-de-120-resultados-google-maps"],
  },
  {
    id: "lgpd",
    name: "LGPD",
    definition:
      "A LGPD (Lei nº 13.709/2018) é a Lei Geral de Proteção de Dados do Brasil. Para prospecção com dados públicos do Google Maps, ela exige base legal identificada, finalidade legítima, minimização de dados, direitos do titular (acesso, correção, eliminação) e canais de oposição — dados pessoais de contato só devem ser usados com transparência e possibilidade de descadastro imediato.",
    related: ["opt-out", "lista-de-supressao"],
    posts: ["lgpd-e-extracao-de-dados-publicos", "whatsapp-para-vendas-b2b"],
  },
  {
    id: "opt-out",
    name: "Opt-out",
    definition:
      "Opt-out é a escolha do titular de não receber mais comunicações. No Play Google Scraper, respostas como \"sair\", \"parar\" ou \"descadastrar\" em uma campanha de WhatsApp interrompem o envio para aquele contato na hora e movem o número para a lista de supressão permanente do tenant.",
    related: ["lista-de-supressao", "lgpd"],
    posts: ["whatsapp-para-vendas-b2b", "lgpd-e-extracao-de-dados-publicos"],
  },
  {
    id: "lista-de-supressao",
    name: "Lista de supressão",
    definition:
      "Lista de supressão é o registro permanente de contatos que não devem receber comunicações (opt-out, número inválido ou reclamação). Nenhuma campanha do Play Google Scraper enfileira mensagem para telefone que esteja na supressão do tenant — o filtro roda no servidor antes da fila.",
    related: ["opt-out", "lgpd"],
    posts: ["whatsapp-para-vendas-b2b", "lgpd-e-extracao-de-dados-publicos"],
  },
  {
    id: "aquecimento-numero",
    name: "Aquecimento de número",
    definition:
      "Aquecimento de número é o processo de aumentar gradualmente o volume diário de envios de um número de WhatsApp novo, começando baixo (sugestão: 20/dia) e crescendo conforme a reputação — reduz drasticamente o risco de banimento por comportamento anômalo.",
    related: ["opt-out", "lista-de-supressao"],
    posts: ["whatsapp-para-vendas-b2b"],
  },
];

export function getGlossaryTerm(id: string): GlossaryTerm | undefined {
  return GLOSSARY_TERMS.find((term) => term.id === id);
}
