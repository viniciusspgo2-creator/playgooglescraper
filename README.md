# Play Google Scraper

Plataforma SaaS multi-tenant de extração de leads do Google Maps + **extensão Chrome MV3** interligada, com gerenciador de campanhas WhatsApp, Kanban de vendas, billing (Stripe/Mercado Pago), API pública versionada e camada **SEO Enterprise + GEO/LLMO** completa (blog, glossário, llms.txt).

- **Landing pública** (`/`) em 3 idiomas (pt-BR, en-US, es-ES) com JSON-LD (Organization, WebSite, SoftwareApplication, Service, FAQPage, HowTo), OG/Twitter Cards, canonical absoluto, sitemap.xml, robots.txt com 20 crawlers de IA opt-in, `/llms.txt` e `/llms-full.txt`.
- **Painel** (`/app`): Dashboard, Buscas, Leads (tabela virtual + drawer + filtros), Kanban (drag HTML5 persistido), Campanhas WhatsApp (fila real, janela horária, aquecimento, supressão/opt-out), Templates, Tokens & Conexão (API keys + webhooks), Extensão (download com token embutido), Billing, Membros, Auditoria.
- **Extensão MV3** (`extension/`): scraping humanizado (humanizer + fila + quadtree + circuit breaker), Side Panel, conexão via `config.js` com `apiBase`/token injetados no download, ingestão idempotente por `idempotencyKey`.
- **Isolamento multi-tenant**: 100% das queries de negócio via `tenantDb(tenantId)` — provado por `bun run verify:isolation` (56/56).

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 + TypeScript 5 |
| Estilo | Tailwind CSS 4 + shadcn/ui (New York) + Lucide |
| Banco | PostgreSQL (Neon) via Prisma ORM |
| Auth | NextAuth.js v4 (credentials + convite por e-mail) |
| Estado | TanStack Query + Zustand |
| i18n | next-intl (3 idiomas, 684 chaves em paridade) |
| Billing | Stripe Checkout + Mercado Pago (webhooks idempotentes) |
| Analytics | GA4 + GTM (env-gated, zero script sem env) |

## Estrutura

```
play-google-scraper/
├── src/
│   ├── app/                  # rotas (/, /app, /blog, /glossario, /sobre, /api/**)
│   ├── components/           # ui/ (shadcn), app/ (painel), marketing/, landing/
│   ├── server/               # tenancy (guard), auth, campaigns, billing, tokens…
│   ├── content/              # 6 artigos SEO + glossário (20 termos) × 3 idiomas
│   ├── lib/                  # site.ts (fonte única da marca), seo.tsx, analytics…
│   └── i18n/                 # messages/{pt-BR,en-US,es-ES}.json
├── extension/                # Chrome MV3 (manifest, sw, content, side panel)
├── prisma/                   # schema.prisma (PostgreSQL) + seed.ts
├── scripts/                  # verify-isolation, load-ingest (50k), pack-extension…
├── docs/                     # DEPLOY.md, CHROME-WEB-STORE.md, phases/, adr/
├── public/                   # imagens SEO (AVIF/WebP), manifest.webmanifest
├── next.config.ts            # headers de segurança, redirects 301, imagens, tracing
└── .env.example              # todas as variáveis documentadas
```

## Requisitos

- **Bun ≥ 1.1** (ou Node ≥ 20 + pnpm/npm — comandos abaixo usam Bun)
- Banco **PostgreSQL** (local ou [Neon](https://neon.tech))

## Rodando localmente

```bash
bun install

# 1. Configure as variáveis (mínimo: DATABASE_URL, AUTH_SECRET, APP_URL)
cp .env.example .env
#   AUTH_SECRET:  openssl rand -hex 32
#   APP_URL:      http://localhost:3000
#   DATABASE_URL: postgresql://usuario:senha@host:5432/banco

# 2. Crie o schema e (opcional) popule dados de demonstração
bun run db:push
bun run db:seed        # cria tenant Demo (SEED) — remova após criar sua conta

# 3. Desenvolvimento
bun run dev            # http://localhost:3000
```

## Deploy na Vercel + Neon

1. **Neon**: crie o projeto, copie a *pooled connection string* (`…-pooler…?sslmode=require`).
2. **Vercel**: importe o repositório — Build Command `bun run build` (já roda `prisma generate && prisma db push && next build`), Output `.next`, Start `next start`.
3. **Environment Variables** (Settings → Environment Variables): `DATABASE_URL`, `AUTH_SECRET`, `APP_URL` (+ opcionais: `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_GTM_ID`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MERCADOPAGO_WEBHOOK_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`, `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`).
4. **Pós-deploy** (checklist completo em `docs/DEPLOY.md`): rodar `bun run verify:isolation` contra o banco de produção, criar o owner real pela landing e remover o tenant de seed.

### Webhooks de billing (configurar no provedor)

- Stripe → `https://SEU-DOMINIO/api/webhooks/stripe` (`checkout.session.completed`, `invoice.paid`, `payment_intent.succeeded`)
- Mercado Pago → `https://SEU-DOMINIO/api/webhooks/mercadopago` (`external_reference=tenantId|plan|credits|seats`)
- Idempotência por `BillingEvent(provider, eventId)` — reentregas são seguras.

## Extensão Chrome

- O pacote é gerado **dentro do painel** (`Extensão → Baixar`) com o `apiBase` do próprio domínio e, opcionalmente, o token da operadora embutido (`POST {token}` no mesmo endpoint).
- Instalação em modo desenvolvedor: `chrome://extensions` → *Load unpacked* → pasta extraída.
- Publicação na Chrome Web Store: `docs/CHROME-WEB-STORE.md`.

## API pública (v1)

Autenticação por Bearer token (`pgs_live_…`) criado em **Tokens & Conexão**:

- `POST /api/v1/leads/batch` — ingestão em lote (gzip aceito, idempotente por `idempotencyKey`, rate limit 120/min)
- `GET /api/v1/leads` — listagem paginada com filtros
- `POST /api/v1/whatsapp/reply` — webhook de respostas da operadora WhatsApp (auto-stop em "SAIR" → supressão `opt_out`)

## QA embutido

```bash
bun run verify:isolation   # 56 verificações de isolamento multi-tenant (rodar antes de todo deploy)
bun run lint               # ESLint + regras Next.js
bunx tsc --noEmit          # tipagem estrita
bun scripts/load-ingest.ts # teste de carga 50k leads pela API real
```

## SEO + GEO (LLM Optimization)

- **On-page**: títulos/metas únicos, H1 único por página, canonical absoluto, OG/Twitter, geo tags, `lang` dinâmico.
- **Infra**: `sitemap.xml` (10 URLs + imagens), `robots.txt` (admin/API bloqueados; GPTBot, PerplexityBot, ClaudeBot, Google-Extended, CCBot etc. permitidos), redirects 301, HSTS + CSP + X-Frame-Options DENY, imagens AVIF/WebP com `width/height` e alt descritivo.
- **Dados estruturados**: Organization (sameAs), WebSite+SearchAction, SoftwareApplication (oferta BRL), Service, BreadcrumbList, FAQPage, HowTo, TechArticle (datePublished/Modified, wordCount), DefinedTermSet, AboutPage.
- **Conteúdo GEO**: blog com 6 artigos estratégicos (BLUF, "Principais conclusões", tabelas comparativas, fontes primárias), glossário com 20 termos citáveis, `/sobre` com E-E-A-T, `llms.txt`/`llms-full.txt` sempre sincronizados.
- **Analytics**: GA4+GTM com eventos `cta_click`, `form_submit`, `sign_up`, `login`, `extension_download`, `deal_closed` e scroll depth 25/50/75/100.

## Documentação

| Documento | Conteúdo |
| --- | --- |
| `docs/DEPLOY.md` | Deploy Vercel/Neon, env vars, webhooks, checklist pós-deploy |
| `docs/CHROME-WEB-STORE.md` | Publicação da extensão na loja |
| `docs/phases/FASE-2.md` | Schema multi-tenant e decisões de dados |
| `docs/phases/FASES-3-10.md` | Painel, extensão, kanban, WhatsApp, billing, hardening |
| `docs/adr/` | Decisões de arquitetura (ADR) |

## Licença

Uso privado/proprietário. Todos os direitos reservados ao detentor do projeto.
