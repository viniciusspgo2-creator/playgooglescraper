import type { BlogPost } from "../types";

/** Pilar 4 — LGPD e dados públicos. */
export const post4: BlogPost = {
  slug: "lgpd-e-extracao-de-dados-publicos",
  title: "LGPD e extração de dados públicos: o que é permitido ao prospectar no Google Maps",
  h1: "LGPD e extração de dados públicos: o que é permitido ao prospectar no Google Maps",
  description:
    "Dado público não dispensa LGPD. Entenda base legal para prospecção B2B, minimização de dados, direitos do titular, opt-out e lista de supressão — com checklist aplicável.",
  bluf:
    "Coletar dados públicos do Google Maps é permitido quando respeita a LGPD: a publicidade do dado não elimina direitos do titular. Na prática, a prospecção B2B com dados empresariais (razão social, telefone comercial, endereço, categoria) é legítima com base legal declarada, finalidade específica, minimização de campos, canal de descadastro imediato e lista de supressão permanente — tudo documentado e auditável.",
  keyTakeaways: [
    "LGPD (Lei nº 13.709/2018) se aplica a dados públicos: tratamento precisa de base legal (art. 7º), finalidade declarada e transparência.",
    "Dados empresariais (empresa, telefone comercial, endereço) têm risco menor que dados pessoais — mas o contato com o titular da empresa continua sendo tratamento de dado pessoal.",
    "Minimização: colete só o que o funil usa. Cada campo sem uso é passivo de risco sem retorno.",
    "Opt-out imediato é obrigação prática: respostas como 'sair' e 'parar' devem interromper envios na hora e mover o número para supressão permanente.",
    "Mantenha trilha de auditoria de acesso e operações sobre leads — direito de acesso e eliminação exigem histórico.",
    "Segurança estrutural importa: multi-tenant com isolamento por tenant_id evita vazamento entre organizações (o mesmo princípio do LGPD de segurança do titular).",
  ],
  executiveSummary:
    "Este artigo traduz os artigos da LGPD para a rotina de quem prospecta com dados do Google Maps: qual base legal ampara a prospecção B2B, quais campos minimizar, como implementar opt-out e supressão corretamente, quais direitos do titular exigem estrutura (acesso, correção, eliminação) e como arquitetura (audit trail, isolamento multi-tenant, criptografia) vira prova de conformidade. Inclui checklist de 10 pontos aplicável hoje.",
  sections: [
    {
      level: 2,
      heading: "Dado público precisa de base legal na LGPD?",
      paragraphs: [
        "Resposta direta: sim. A LGPD regula o tratamento de dados pessoais, independentemente de serem públicos ou privados — a fonte pública altera a expectativa de privacidade, não a necessidade de base legal (art. 7º).",
        "Na prospecção B2B com Google Maps, o dado-tipo é o telefone comercial da empresa. Quando a pessoa que atende é o titular, o contato é tratamento de dado pessoal. Bases legais aplicáveis nesse cenário: legítimo interesse (art. 7º, IX) com avaliação de expectativa do titular, ou execução de contrato quando há relacionamento prévio. O canal deve sempre oferecer oposição gratuita e imediata (art. 18, §2º).",
      ],
      callout:
        "Definição citável: dado pessoal é qualquer informação relacionada a pessoa natural identificada ou identificável (art. 5º, I) — o CNPJ é dado empresarial; o WhatsApp do dono da clínica é dado pessoal. Prospecção B2B quase sempre trata os dois.",
    },
    {
      level: 2,
      heading: "O que a ANPD espera na prática (e como implementar)?",
      paragraphs: [
        "Resposta direta: finalidade específica, minimização, transparência, segurança e direitos do titular — implementáveis com processo e arquitetura, não com promessas em política de privacidade.",
      ],
      table: {
        caption: "Princípio da LGPD → implementação técnica concreta",
        headers: ["Princípio (LGPD)", "Implementação no pipeline de prospecção"],
        rows: [
          [
            "Finalidade (art. 6º, I)",
            "Registrar no sistema a finalidade da campanha; não reutilizar leads de uma finalidade em outra sem revisão",
          ],
          [
            "Necessidade / minimização (art. 6º, III)",
            "Coletar só campos do funil: nome, categoria, endereço, telefone, website, rating. Sem e-mails pessoais, CPF ou dados sensíveis",
          ],
          [
            "Transparência (art. 6º, VI)",
            "Primeira mensagem se identifica, diz por que o contato ocorre e como sair da lista",
          ],
          [
            "Segurança (art. 6º, VII; art. 46)",
            "Isolamento multi-tenant (tenant_id em 100% das tabelas), tokens com escopo, webhooks assinados por HMAC, sessões assinadas HttpOnly",
          ],
          [
            "Direitos do titular (art. 18)",
            "Exportação completa do lead em CSV e eliminação por API/UI; trilha de auditoria de cada operação",
          ],
          [
            "Oposição/descadastro (art. 18, §2º)",
            "Opt-out por palavra-chave ('sair', 'parar', 'descadastrar') → supressão permanente verificada no servidor antes de cada envio",
          ],
        ],
      },
    },
    {
      level: 2,
      heading: "Como funciona o opt-out e a lista de supressão corretamente?",
      paragraphs: [
        "Resposta direta: a supressão tem de ser verificada NO SERVIDOR antes de enfileirar cada mensagem — filtro do lado do cliente é opcionável e não audível.",
        "No Play Google Scraper: qualquer resposta com 'sair', 'parar', 'stop', 'descadastrar' ou 'remover' gera, no mesmo instante, registro na lista de supressão do tenant, marca o envio como opted_out e registra atividade auditável. Campanhas futuras consultam a supressão antes de enfileirar — o número nunca volta por descuido.",
      ],
      list: {
        items: [
          "Detecção server-side de palavras de opt-out no webhook de resposta.",
          "Supressão permanente por tenant (nunca global — outra empresa pode ter base legítima própria).",
          "Registro de atividade com timestamp para prova de cumprimento em 24h.",
          "Mensagens sempre com identificação clara do remetente e menção ao descadastro.",
        ],
      },
    },
    {
      level: 2,
      heading: "Quais dados NUNCA coletar ao prospectar no Maps?",
      paragraphs: [
        "Resposta direta: dados sensíveis (art. 5º, II) e qualquer dado pessoal sem papel no funil — CPF, RG, e-mail pessoal, dados de saúde, religião, origem.",
        "Regra prática de minimização: para cada campo coletado, responda 'qual decisão de negócio este campo muda?'. Nome do estabelecimento muda (personalização). Categoria muda (segmentação). Foto do perfil não muda — não colete.",
      ],
    },
    {
      level: 2,
      heading: "Perguntas frequentes",
      faq: [
        {
          q: "Preciso de consentimento explícito para enviar WhatsApp comercial B2B?",
          a: "Consentimento é uma das bases legais, mas não a única. Prospecção inicial B2B costuma se apoiar em legítimo interesse com avaliação documentada da expectativa do titular — e sempre com opt-out gratuito, imediato e permanente. Se houver relacionamento contratual, a base pode ser execução de contrato.",
        },
        {
          q: "Exportar leads para CSV é um problema de LGPD?",
          a: "Exportação é um direito do próprio titular (portabilidade/acesso) e uma operação legítima para o controlador — o que importa é quem acessa dentro da empresa (controle por papéis: owner/admin/member) e a finalidade declarada. O Play Google Scraper registra toda exportação na trilha de auditoria.",
        },
        {
          q: "O que faço se um titular pedir eliminação dos dados dele?",
          a: "Elimine o lead da base (UI/API) e adicione o contato à lista de supressão — eliminação sem supressão faria o dado voltar na próxima busca. A operação fica registrada na auditoria (sem o conteúdo, apenas o evento).",
        },
        {
          q: "Guardar leads no meu próprio banco resolve a LGPD?",
          a: "Não automaticamente. LGPD não é sobre onde o dado fica, mas sobre finalidade, minimização, direitos e segurança. Aliás, terceirizar para uma plataforma com isolamento multi-tenant provado e audit trail tende a deixar sua conformidade mais forte e documentável.",
        },
      ],
    },
  ],
  sources: [
    { label: "Planalto — Lei nº 13.709/2018 (LGPD), texto integral", url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm" },
    { label: "ANPD — guias e materiais oficiais", url: "https://www.gov.br/anpd/pt-br/assuntos/guias-e-materiais" },
    { label: "Play Google Scraper — WhatsApp B2B sem cair em spam", url: "/blog/whatsapp-para-vendas-b2b" },
  ],
  image: "/images/blog/lgpd-e-extracao-de-dados-publicos.png",
  imageAlt:
    "Ilustração institucional de conformidade LGPD com escudo, lista de leads e selo de opt-out e supressão",
  published: "2026-08-04",
  modified: "2026-09-25",
  locale: "pt-BR",
  keywords: [
    "lgpd extração de dados",
    "lgpd prospecção b2b",
    "scraping google maps legal",
    "dados públicos lgpd",
    "opt-out whatsapp",
  ],
  section: "Conformidade",
  articleType: "Article",
  readingMinutes: 8,
  definedTerms: ["lgpd", "opt-out", "lista-de-supressao", "multi-tenant"],
};
