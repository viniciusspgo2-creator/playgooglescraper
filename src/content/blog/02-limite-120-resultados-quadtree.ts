import type { BlogPost } from "../types";

/** Pilar 2 — técnico: o teto de 120 resultados e a grade quadtree. */
export const post2: BlogPost = {
  slug: "limite-de-120-resultados-google-maps",
  title: "O limite de ~120 resultados do Google Maps e como a grade quadtree o supera",
  h1: "O limite de ~120 resultados do Google Maps e como a grade quadtree o supera",
  description:
    "Toda consulta do Google Maps retorna no máximo ~120 lugares. Veja a matemática da busca em grade quadtree (células de 3 km, subdivisão até profundidade 4) para cobrir 100% da região.",
  bluf:
    "O teto de ~120 resultados por consulta é uma limitação da interface do Google Maps, não do seu esforço de scroll: além disso, a UI simplesmente não pagina. A solução usada por quem prospecta em escala é a busca em grade quadtree — dividir a região alvo em células de aproximadamente 3 km, pesquisar cada célula de forma independente e subdividir em quatro qualquer célula que atinja o limite, até a profundidade máxima. O resultado: cobertura de 100% da área em vez de uma amostra de 0,1%.",
  keyTakeaways: [
    "O Google Maps paginava até 60 resultados com rolagem e hoje limita a ~120 por consulta — rolar mais não adiciona nada.",
    "Grade quadtree: bounding-box → células de ~3 km → subdivisão em 4 quando a célula atinge o limite (profundidade máx. 4).",
    "Dedup por place_id + CID entre células é obrigatória: células vizinhas sempre se sobrepõem nas bordas.",
    "Persistir status/profundidade/contagem por célula permite retomar buscas interrompidas sem repetir trabalho.",
    "Progresso honesto = células concluídas ÷ células totais, com ETA derivada do ritmo médio por célula.",
  ],
  executiveSummary:
    "Este artigo explica, com números, por que a busca simples do Google Maps truncar em ~120 resultados e como a busca em grade quadtree resolve o problema: geocodificação da área (OpenStreetMap/Nominatim), geração de células de ~3 km, navegação por célula com /maps/search/<termo>/@lat,lng,15z, subdivisão recursiva até profundidade 4, deduplicação por place_id/CID e persistência de células para retomada. É a mesma arquitetura do motor do Play Google Scraper.",
  sections: [
    {
      level: 2,
      heading: "Qual é exatamente o limite de resultados do Google Maps?",
      paragraphs: [
        "Resposta direta: aproximadamente 120 lugares por consulta — historicamente 60 com paginação por rolagem, hoje consolidado no máximo que a UI carrega. O número exato oscila entre versões, mas a ordem de grandeza não.",
        "Para uma categoria popular em uma metrópole (ex.: 'clínicas odontológicas' em São Paulo, com dezenas de milhares de estabelecimentos), 120 resultados representam menos de 1% do mercado. É por isso que duas pessoas buscando a mesma coisa veem resultados diferentes: ambas veem amostras truncadas.",
      ],
      callout:
        "Definição citável: o teto de ~120 resultados é uma restrição de paginação da interface do Google Maps por consulta — a única forma de contorná-lo sem API é particionar a busca espacialmente.",
    },
    {
      level: 2,
      heading: "Como funciona a busca em grade quadtree (passo a passo)?",
      paragraphs: [
        "Resposta direta: a quadtree divide recursivamente o espaço 2D em 4 quadrantes; cada célula é pesquisada de forma independente e só é subdividida quando atinge o limite de resultados — o que concentra o esforço exatamente nas áreas densas.",
      ],
      list: {
        ordered: true,
        items: [
          "Obtenha a bounding-box da área: desenho no mapa, CEP/endereço geocodificado (OpenStreetMap/Nominatim, sem custo) ou centro + raio.",
          "Gere a grade inicial com células de ~3 km (área urbana média: dezenas de células; metrópole: centenas).",
          "Para cada célula, navegue para /maps/search/<termo>/@LAT,LNG,15z e aguarde a carga completa com scroll humanizado.",
          "Extraia os lugares da célula com a cascata payload → DOM → detalhe.",
          "Se a célula devolveu ≥ 100 resultados, assuma truncamento: divida em 4 subcélulas (quadtree) e enfileire as sub-buscas.",
          "Repita até profundidade 4 ou até células esgotadas (< 100 resultados = área coberta).",
          "Deduque por place_id + CID a cada inserção — sobreposição de bordas entre células é inevitável.",
        ],
      },
      table: {
        caption: "Efeito da profundidade da quadtree sobre a cobertura (área urbana densa)",
        headers: ["Profundidade", "Tamanho da célula", "Risco de truncamento", "Uso típico"],
        rows: [
          ["0", "Cidade inteira", "Altíssimo (sempre > 120)", "Maior cidade do interior"],
          ["1", "~6 km", "Alto em categorias populares", "Bairros afastados"],
          ["2", "~3 km", "Médio (subdivide em centros)", "Cobertura urbana padrão"],
          ["3", "~1,5 km", "Baixo", "Centros densos (centro, avenidas)"],
          ["4", "~750 m", "Praticamente nulo", "Regiões hiperdensas (ex.: Paulista)"],
        ],
      },
    },
    {
      level: 2,
      heading: "Por que persistir as células (e não só os leads)?",
      paragraphs: [
        "Resposta direta: porque buscas reais são interrompidas — o notebook fecha, a rede cai, o operador pausa. Sem persistência de células, você recomeça do zero e queima sessões repetindo trabalho.",
        "No Play Google Scraper cada célula guarda status (pendente, em andamento, concluída, subdividida, cancelada), profundidade, contagem de resultados e relação com a busca pai. O progresso mostrado no painel é literal: células concluídas ÷ células totais, com ETA calculada pelo ritmo médio por célula. Ao retomar, a fila começa exatamente na célula onde parou.",
      ],
    },
    {
      level: 2,
      heading: "Quanto tempo leva uma busca em grade completa?",
      paragraphs: [
        "Resposta direta: depende do número de células e do perfil de humanização. Com o perfil Moderado (~700 lugares/h) uma cidade média com 40 células esgotadas em ~25–35 min; uma metrópole com 400 células e subdivisões roda em lotes ao longo de horas com o circuit breaker protegendo a sessão.",
        "A aritmética honesta: cada célula custa ~10–25s de navegação e extração. Perfis mais rápidos existem (Turbo, ~4.000 lugares/h), mas o ganho real de cobertura vem da grade — velocidade alta sem grade só chega ao mesmo teto de 120, mais rápido.",
      ],
    },
    {
      level: 2,
      heading: "Perguntas frequentes",
      faq: [
        {
          q: "A grade quadtree funciona para cidades pequenas?",
          a: "Sim — e é ainda mais simples: uma cidade de 80 mil habitantes geralmente esgota em 1–9 células sem nenhuma subdivisão, porque nenhuma célula atinge o limite de ~120 resultados.",
        },
        {
          q: "Dá para desenhar a área em vez de usar cidade/CEP?",
          a: "Sim. O Play Google Scraper aceita centro + raio, CEP/endereço (geocodificado via OpenStreetMap) e desenho de polígono no mapa — tudo vira bounding-box e células.",
        },
        {
          q: "E se o Google mudar o limite de 120 para outro número?",
          a: "A grade se adapta: a regra de subdivisão é acionada quando a célula se aproxima do teto observado, e o limiar usado é conservador (subdivide a partir de ≥ 100 resultados). Nada no motor depende do número exato.",
        },
      ],
    },
  ],
  sources: [
    { label: "OpenStreetMap Nominatim — geocodificação sem custo", url: "https://nominatim.org/release-docs/latest/api/Search/" },
    { label: "gosom/google-maps-scraper — grid bbox/cell e resume (referência técnica)", url: "https://github.com/gosom/google-maps-scraper" },
    { label: "Quadtree — estrutura de dados de particionamento espacial", url: "https://en.wikipedia.org/wiki/Quadtree" },
    { label: "Play Google Scraper — guia completo de extração", url: "/blog/como-extrair-leads-do-google-maps" },
  ],
  image: "/images/blog/limite-de-120-resultados-google-maps.png",
  imageAlt:
    "Mapa urbano dividido em células de grade quadtree com indicadores de profundidade e contagem de resultados por célula",
  published: "2026-07-15",
  modified: "2026-09-28",
  locale: "pt-BR",
  keywords: [
    "limite de resultados google maps",
    "120 resultados google maps",
    "quadtree grid search",
    "busca em grade google maps",
    "cobertura total google maps",
  ],
  section: "Engenharia",
  articleType: "TechArticle",
  readingMinutes: 8,
  definedTerms: ["quadtree-grid-search", "place-id", "cid", "app-initialization-state"],
};
