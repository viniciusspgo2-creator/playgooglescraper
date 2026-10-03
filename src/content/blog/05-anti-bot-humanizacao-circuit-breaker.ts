import type { BlogPost } from "../types";

/** Pilar 5 — anti-bot: humanização log-normal + circuit breaker. */
export const post5: BlogPost = {
  slug: "anti-bot-humanizacao-e-circuit-breaker",
  title: "Como prospectar em escala sem ser bloqueado: humanização log-normal e circuit breaker",
  h1: "Como prospectar em escala sem ser bloqueado: humanização log-normal e circuit breaker",
  description:
    "Anti-bot do Google Maps detecta padrões, não bots. Distribuição log-normal nos intervalos, Bézier no mouse, backoff exponencial 30s→30min e como os 4 perfis de velocidade se equilibram.",
  bluf:
    "Sistemas anti-abuse não detectam 'bots' — detectam padrões que humanos não produzem: intervalos uniformes, movimentos retos, cadência constante. A defesa profissional é dupla: humanização estatística (intervalos com distribuição log-normal, mouse com curvas Bézier e overshoot, scroll com easing) e circuit breaker (ao menor sinal de bloqueio, pausa exponencial de 30s → 2min → 8min → 30min com downgrade de velocidade) — preservando a sessão real do navegador, que é o ativo mais valioso da operação.",
  keyTakeaways: [
    "Intervalos fixos (ex.: sempre 2s) são a assinatura clássica de bot — o humano real produz intervalos com cauda longa (log-normal).",
    "Log-normal via transformação de Box-Muller: perfil Furtivo 2,8–6,5s (~250/h), Moderado 1,2–3,0s (~700/h), Rápido 0,5–1,4s (~1.800/h), Turbo 0,15–0,5s (~4.000/h).",
    "Mouse com interpolação cúbica Bézier + overshoot e scroll com easing easeOutCubic completam a semântica de interação humana.",
    "Circuit breaker em 3 gatilhos: CAPTCHA, redirecionamento para /sorry/index e HTTP 429 — pausa exponencial 30s → 2min → 8min → 30min + downgrade de um nível de velocidade.",
    "Fila local persistente (IndexedDB) com lotes idempotentes garante que nada se perde durante pausas — retomada automática.",
    "Regra de ouro: velocidade máxima sustentável é a que não gera CAPTCHA por dias — e isso é medido por telemetria, não por sorte.",
  ],
  executiveSummary:
    "Este artigo técnico destrincha a mecânica da sobrevivência em extração de longa duração: por que distribuição log-normal (Box-Muller) supera intervalos fixos e uniformes, como curvas Bézier e scroll com easing simulam a física do cursor e da rolagem humanas, quais os 3 gatilhos exatos do circuit breaker e como o backoff exponencial com downgrade evita a espiral de bloqueio. Fecha com a tabela dos 4 perfis de velocidade do Play Google Scraper e critérios objetivos para escolher o perfil por operação.",
  sections: [
    {
      level: 2,
      heading: "Por que intervalos fixos entregam a automação?",
      paragraphs: [
        "Resposta direta: porque humanos variam. Uma pessoa real lê um perfil por 4 segundos, o próximo por 12, o outro por 1,5 — a distribuição desses tempos tem cauda à direita (log-normal), não é uniforme nem fixa.",
        "Heurísticas anti-abuse medem exatamente isso: variância dos intervalos, periodicidade das requisições, retilineidade do cursor. Um script com `sleep(2)` tem variância zero — flag imediata. A humanização correta amostra cada intervalo de uma distribuição log-normal calibrada para o perfil de velocidade escolhido.",
      ],
      callout:
        "Definição citável: humanização log-normal é a amostragem de tempos de espera e deslocamentos a partir de uma distribuição log-normal (implementada com transformação de Box-Muller), reproduzindo a cauda longa natural do comportamento humano em vez de intervalos fixos ou uniformes.",
    },
    {
      level: 2,
      heading: "O que mais conta além do tempo: mouse e scroll",
      paragraphs: [
        "Resposta direta: o caminho do cursor e a curva de rolagem. Cursor humano acelera e desacelera com antecipação e, frequentemente, passa do alvo e volta (overshoot); rolagem humana começa rápida e desacelera suavemente.",
        "Implementação de referência: interpolação com curva cúbica Bézier entre origem e destino do mouse (com ponto de controle deslocado para gerar arco natural) e overshoot probabilístico; scroll por requestAnimationFrame com easing easeOutCubic, pedindo ao orquestrador pausas log-normais entre blocos. Bloqueio de carregamento de imagens/fontes pesadas reduz huellas de requisições e acelera a célula sem mudar o padrão de interação.",
      ],
    },
    {
      level: 2,
      heading: "Como funciona o circuit breaker na prática?",
      paragraphs: [
        "Resposta direta: três gatilhos objetivos — página de CAPTCHA, redirecionamento para /sorry/index e resposta HTTP 429. Ao detectar qualquer um, o motor pausa, aplica backoff exponencial (30s → 2min → 8min → 30min) e desce um nível de velocidade permanente até nova avaliação.",
      ],
      list: {
        ordered: true,
        items: [
          "Detecção: inspecionar URL (path /sorry/index), título da página e status HTTP a cada navegação de célula.",
          "Reação imediata: parar a fila — nenhum lote é perdido (fila persistida em IndexedDB).",
          "Backoff: 30s na 1ª ocorrência, 2min na 2ª, 8min na 3ª, 30min na 4ª+.",
          "Downgrade: uma velocidade abaixo (ex.: Rápido → Moderado) — o degrau é mantido, não reiniciado a cada pausa.",
          "Retomada: célula atual é reprocessada do início; leads já extraídos não duplicam (dedup por place_id).",
          "Telemetria: ocorrências ficam visíveis no painel — se o CAPTCHA só aparece no Turbo, o dado fala.",
        ],
      },
    },
    {
      level: 2,
      heading: "Qual perfil de velocidade escolher?",
      paragraphs: [
        "Resposta direta: comece no Moderado (~700 lugares/h). Suba para Rápido/Turbo apenas se a telemetria de bloqueio estiver zerada por dias consecutivos e o volume exigir.",
      ],
      table: {
        caption: "Perfis de humanização do Play Google Scraper (valores reais do motor)",
        headers: ["Perfil", "Intervalo entre ações", "Throughput aproximado", "Uso recomendado"],
        rows: [
          ["Furtivo", "2,8–6,5s", "~250 leads/hora", "Contas novas, sessões sensíveis, horários de pico"],
          ["Moderado (default)", "1,2–3,0s", "~700 leads/hora", "Operação contínua padrão"],
          ["Rápido", "0,5–1,4s", "~1.800 leads/hora", "Bases amplas com telemetria limpa"],
          ["Turbo", "0,15–0,5s", "~4.000 leads/hora", "Janelas curtas de alta demanda, monitoradas"],
        ],
      },
    },
    {
      level: 2,
      heading: "Qual é o limite prático de uma operação de alta velocidade?",
      paragraphs: [
        "Resposta direta: o limite prático raramente é o perfil de velocidade — é a cobertura da grade (veja o artigo sobre o teto de 120 resultados). Velocidade alta sem grade só repete amostras truncadas mais depressa.",
      ],
    },
    {
      level: 2,
      heading: "Perguntas frequentes",
      faq: [
        {
          q: "Humanização garante que nunca serei bloqueado?",
          a: "Nenhuma abordagem honesta garante 100%. O que a combinação log-normal + Bézier + circuit breaker garante é: mínima superfície de detecção, reação imediata a sinais e zero perda de dados durante pausas — com degradação graciosa em vez de colisão.",
        },
        {
          q: "Por que rodar na minha sessão real do Chrome em vez de headless?",
          a: "Sessões reais têm fingerprint autêntico (fontes, histórico, cookies, telemetria do Chrome), enquanto ambientes headless em datacenter compartilham sinais entre milhares de operações diferentes. Estatisticamente, o navegador real do operador é o melhor camuflado.",
        },
        {
          q: "O que acontece com meus dados se a aba fechar no meio da busca?",
          a: "Nada se perde: a fila fica em IndexedDB no navegador e as células persistidas no servidor definem onde retomar. Ao reabrir, a extensão sincroniza e continua da célula interrompida.",
        },
      ],
    },
  ],
  sources: [
    { label: "Box-Muller transform — amostragem de distribuições normais", url: "https://en.wikipedia.org/wiki/Box%E2%80%93Muller_transform" },
    { label: "Log-normal distribution — modelo de tempos de reação humanos", url: "https://en.wikipedia.org/wiki/Log-normal_distribution" },
    { label: "Xetera/ghost-cursor — curvas Bézier com overshoot (referência técnica)", url: "https://github.com/Xetera/ghost-cursor" },
    { label: "Play Google Scraper — grade quadtree vs teto de 120 resultados", url: "/blog/limite-de-120-resultados-google-maps" },
  ],
  image: "/images/blog/anti-bot-humanizacao-e-circuit-breaker.png",
  imageAlt:
    "Gráfico de distribuição log-normal de intervalos de extração ao lado de um painel de circuit breaker com pausas exponenciais",
  published: "2026-08-12",
  modified: "2026-09-30",
  locale: "pt-BR",
  keywords: [
    "anti-bot google maps",
    "humanização log-normal",
    "circuit breaker scraping",
    "como evitar bloqueio google maps",
    "ghost cursor",
  ],
  section: "Engenharia",
  articleType: "TechArticle",
  readingMinutes: 9,
  definedTerms: ["humanizacao-log-normal", "circuit-breaker", "rate-limit", "cascata-extracao"],
};
