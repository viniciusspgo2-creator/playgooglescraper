# Guia de deploy — Play Google Scraper

## 1. Banco de dados
O schema (`prisma/schema.prisma`) já está em **PostgreSQL** (`provider = "postgresql"`), pronto para Vercel + Neon — nenhuma troca de provider é necessária.
- Crie o banco no [Neon](https://neon.tech), copie a **pooled connection string** para `DATABASE_URL`. O `build` já roda `prisma db push` (sem `--accept-data-loss`: se uma mudança de schema for destrutiva o build falha em vez de apagar dados — nesse caso rode `bun run db:push` manualmente após revisar).
- Campos de status ficam em `String` validados por Zod nas bordas e JSON em `String` com sufixo `Json` — portabilidade total, zero parsing implícito no client.
- O `TenantGuard` é isolamento de aplicação e funciona igual em qualquer banco — **não** remova as regras do guard.

## 2. Variáveis de ambiente (mínimo de produção)
```
DATABASE_URL=...
AUTH_SECRET=<openssl rand -hex 32>
APP_URL=https://seu-dominio.com
```
Opcionais: `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, `MERCADOPAGO_ACCESS_TOKEN` + `MERCADOPAGO_WEBHOOK_SECRET`, `WHATSAPP_CLOUD_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`, `RESEND_API_KEY`.

## 2.1 Deploy na Vercel (passo a passo)
1. Suba o projeto no GitHub e importe em vercel.com/new (framework Next.js detectado; `vercel.json` já define `bun install` / `bun run build`).
2. Em Settings → Environment Variables cadastre `DATABASE_URL`, `AUTH_SECRET` e `APP_URL` (domínio de produção, sem barra final) para **Production** (e Preview, se usar).
3. Deploy. Depois abra o painel → Extensão → Baixar: o zip já sai com a origem do painel em `config.js` e em `host_permissions` do `manifest.json`.
4. Limitações em serverless: rate limit e idempotência de ingestão são em memória por instância (a deduplicação por `placeId` no banco continua garantindo que não há lead duplicado). Para limites estritos, troque por Upstash Redis.

## 3. Build e start
```bash
bun install
bun run db:push        # ou prisma migrate deploy em produção
bun run build
bun run start          # standalone server :3000
```
Atrás de proxy (Caddy/Nginx), preserve `X-Forwarded-Proto/Host` (a origem da extensão injetada no download depende disso).

## 4. Webhooks do provedor
- Stripe: endpoint `https://seu-dominio.com/api/webhooks/stripe` — eventos `checkout.session.completed`, `invoice.paid`, `payment_intent.succeeded`; metadata obrigatória `tenantId/plan/credits/seats`.
- Mercado Pago: `https://seu-dominio.com/api/webhooks/mercadopago` — `external_reference` no formato `tenantId|plan|credits|seats`.
- Idempotência por `BillingEvent(provider, eventId)` — reentregas são seguras.

## 5. Extensão
- O pacote é gerado pelo próprio painel (`Extensão → Baixar`), com `apiBase` apontando para o domínio de produção.
- Publicação na Chrome Web Store: ver `docs/CHROME-WEB-STORE.md`.

## 6. Pós-deploy (checklist)
1. `bun run verify:isolation` contra o banco de produção (nunca pule).
2. Criar owner real via `/` → Criar conta; remover o tenant `Demo (SEED)`.
3. Configurar cron do provedor de WhatsApp para chamar `POST /api/v1/whatsapp/reply` com o token da operadora.
4. Monitorar `/api/activities` (Auditoria) e `WebhookDelivery` com `status=failed`.
5. Backups diários do banco (leads são o ativo do cliente).
