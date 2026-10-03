# Fases 3–10 — Registro de entrega (resumo operacional)

> Decisões de fundo: `docs/adr/ADR-001-adaptacao-stack.md`, `docs/adr/ADR-002-motor-scraping.md`, `docs/adr/ADR-003-app-shell-auth.md`. Registro cronológico completo em `worklog.md`.

## Fase 3 — API v1 e ingestão
- `POST /api/v1/leads/batch` — Bearer `pgs_live_…` (escopo `leads:write`), 120/min por token, JSON ou `Content-Encoding: gzip`, `Idempotency-Key` (replay idempotente), dedup no lote + por `(tenantId, placeId)`, merge "preenche vazio", heat_score recalculado no servidor, reserva atômica de créditos, `402 credits_exhausted` sem perder updates, telemetria por estratégia, webhook `lead.created` enfileirado.
- `POST /api/v1/search/sync` — upsert idempotente de busca/células por `extId` (retomada exata).
- heat_score (ADR-002 D6): sem site +35 | social +18 | rating≥4 +12 | reviews≥15 +10 | telefone +10 | WhatsApp +8 | não-claimed +2 | categoria-alvo +5 (máx 82 → normalizado 0–100). Pesos por tenant em `settingsJson.heatWeights`.
- Smoke automatizado: `bun scripts/smoke-v1.ts` (12 verificações HTTP reais).

## Fase 4 — Extensão Chrome MV3
- Pasta `extension/` (14 arquivos): service worker com loop Quadtree, humanizador log-normal (4 perfis), circuit breaker 30s→2min→8min→30min com downgrade de velocidade, fila IndexedDB (nunca descarta lotes), content script com cascata payload→DOM + pós-filtro bbox + detecção de CAPTCHA, injected.js (MAIN world, `APP_INITIALIZATION_STATE` com validação por campo), side panel com i18n (pt_BR/en_US/es_ES via chrome.i18n).
- Download pelo painel: `GET/POST /api/extension/download` zipa o pacote com a URL da API injetada (POST aceita `{token}` para conexão automática — o token bruto nunca é persistido).
- Inspeção local: `bun scripts/pack-extension.ts`.

## Fase 5 — Painel de leads e buscas
- Buscas planejadas no painel entram na fila e são assumidas pela extensão: `GET /api/v1/search/queue` + `POST /api/v1/search/claim`.
- Leads: listagem server-paginada (testado com 50k: página 1 em 11ms, página 1000 em 37ms), filtros (texto, etapa, temperatura, com/sem site, busca de origem, heat), ações em massa, export CSV (BOM, LGPD auditado).
- Overview com gráficos reais (série 14d, temperatura, etapas, telemetria).

## Fase 6 — Kanban e atividades
- Kanban @dnd-kit com 5 etapas semânticas da marca; drag otimista + PATCH; fallback de teclado (botões ◀ ▶); trilha append-only em `/api/activities` (view Auditoria).

## Fase 7 — WhatsApp
- Templates com `{{nome}}/{{categoria}}/{{cidade}}/{{rating}}` + variações anti-spam; campanhas com audiência prévia, janela de horário (timezone do tenant), limite diário, aquecimento (20/dia crescente), intervalo aleatório entre envios, supressão obrigatória.
- Despacho: Cloud API REAL (`WHATSAPP_CLOUD_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`); sem credenciais, a fila marca mensagens renderizadas como prontas — estado honesto, nada "enviado" de mentira.
- `POST /api/v1/whatsapp/reply` — respostas, auto-stop e opt-out ("sair/parar/stop/descadastrar/remover") → lista de supressão (LGPD). Follow-ups via `nextFollowupAt`.

## Fase 8 — Billing
- Catálogo idêntico à landing (BRL 97/197/497; trial 500 créditos). Checkout Stripe real via REST quando `STRIPE_SECRET_KEY` existe; sem provedor, 409 honesto + ativação manual (owner, auditada).
- Webhooks Stripe/Mercado Pago idempotentes (`BillingEvent @@unique(provider,eventId)`), assinatura HMAC verificada quando o segredo está configurado. Webhooks de saída com assinatura `X-PGS-Signature` e retry com backoff.

## Fase 9 — SEO/landing
- `public/robots.txt` (bloqueia /api/), `src/app/sitemap.ts`, Open Graph/Twitter (Fase 1) + JSON-LD `SoftwareApplication` + `FAQPage` por idioma.

## Fase 10 — Hardening
- `bun run verify:isolation` → **56/56** (leitura/escrita cruzada, create cross-tenant, findUnique proibido, unicidade composta, FK cruzada).
- `bunx tsc --noEmit` limpo · `bun run lint` limpo.
- i18n: **656 chaves × 3 idiomas** em paridade (script verificador embutido em `scripts/i18n-merge.ts`).
- Carga: 50.000 leads em 136,7s pela API real (gzip + idempotência), 0 erros, latência estável (média 383ms/lote, p95 579ms) — limitada deliberadamente pelo rate limit de 120 req/min (a extensão real fica muito abaixo). `bun scripts/load-ingest.ts 50000 8`.
- Navegação E2E real via Agent Browser: login, dashboard, criação de busca, tabela de leads + drawer, Kanban (drag E botão), campanha criada com 6 destinatários, templates, supressão, download da extensão, checkout honesto 409, auditoria, troca pt-BR sem reload (persistida em `users.locale`), dark mode, mobile 390px, console sem erros.

## Variáveis de ambiente (produção)
| Variável | Obrigatória? | Efeito |
|---|---|---|
| `DATABASE_URL` | sim | SQLite (produção: Postgres via Troca de datasource — ver ADR-001) |
| `AUTH_SECRET` | sim (prod) | Assinatura HMAC da sessão |
| `APP_URL` | recomendada | metadataBase/sitemap/checkout return_url |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | opcional | Checkout + webhook reais |
| `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` | opcional | Pix/cartão (webhook implementado) |
| `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | opcional | Despacho real Cloud API |
| `RESEND_API_KEY` | opcional | E-mail de convites (fallback console) |

## Como rodar
```bash
bun install
bun run db:push        # aplica schema
bun run db:seed        # tenant Demo (SEED) — senha Demo1234
bun run dev            # http://localhost:3000
bun run verify:isolation
bun scripts/smoke-v1.ts
bun scripts/pack-extension.ts
bun scripts/load-ingest.ts 50000 8
```
