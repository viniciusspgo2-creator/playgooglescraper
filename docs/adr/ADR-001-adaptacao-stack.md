# ADR-001 — Adaptações de stack para o ambiente de execução atual

- **Status:** Aceito (com pontos pendentes de confirmação do dono)
- **Data:** Fase 0/1
- **Decidido por:** Arquiteto-Executor

## Contexto

A spec do produto pede: Next.js 15/16 + Supabase (Postgres/Auth/Realtime/Storage) com RLS
por `tenant_id`, Upstash Redis, Stripe + Mercado Pago, Resend, tRPC/Server Actions, deploy
Vercel. O ambiente de desenvolvimento atual é um **sandbox single-port** com: Next.js 16
(App Router) já inicializado, **Prisma + SQLite** como camada de dados suportada, cache em
memória local, gateway Caddy (multi-porta via `XTransformPort`), e **uma única rota visível
de UI (`/`)** — constraint da plataforma de preview.

Não há como provisionar Supabase/Upstash neste sandbox (sem credenciais/infra externa), e a
spec do ambiente exige Prisma/SQLite e rota única.

## Decisões

1. **Dados: Prisma + SQLite em vez de Supabase Postgres (por ora).**
   - Isolamento multi-tenant **continua existindo**, mas na camada de aplicação: toda
     consulta passa por um **TenantGuard** (`src/server/tenancy.ts`) que injeta e valida
     `tenant_id` em 100% das queries — função única de acesso ao banco por tabela.
   - O schema Prisma mantém `tenant_id NOT NULL` em toda tabela de negócio e índices
     compostos `(tenant_id, ...)`, **exatamente como a spec pede**, para que a migração
     para Postgres/Supabase+RLS real seja mecânica (mesmos nomes, mesmos índices).
   - Testes de isolamento (Fase 2) provam que tenant A não lê/escreve tenant B **na API**,
     que é o ponto onde o isolamento é exigível neste ambiente.
   - **Não é um rebaixamento silencioso:** fica documentado aqui e o README da Fase 2
     listará o que muda quando houver Supabase.

2. **Realtime: Sem tempo real centralizado; notificação ao vivo via polling incremental
   assinado por tenant (SSE ou intervalo com cursor `updatedAt`), projetado para trocar
   por Supabase Realtime/WS sem mudar a UI.** Justificativa: Supabase indisponível aqui;
   a UI só depende de um contrato `LeadEvent[]`, fácil de servir de qualquer fonte.

3. **Fila/cache: memória local (Map + timers) no lugar de Upstash Redis.** Rate limit,
   dedup cache e fila leve ficam em `src/server/rate-limit.ts` (token bucket por
   token/IP/tenant). Ao migrar para Upstash, só essa classe muda.

4. **UI em rota única (`/`):** o preview só expõe `/`. Landing, auth (Fase 2), dashboard,
   Kanban e campanhas serão **estados de uma mesma aplicação client-side** (shell com
   navegação por estado, URL não muda). Rotas de API em `/api/v1/*` são normais (não são
   páginas). ADR-003 (Fase 2) detalhará o shell.

5. **Monorepo reduzido:** em vez de workspaces `apps/*` + `packages/*` (que quebrariam o
   dev server pré-configurado do sandbox), a estrutura é:
   - `src/` = `apps/web` (Next.js)
   - `extension/` = `apps/extension` (código-fonte MV3 completo da Fase 4, com tsconfig
     próprio e bundle gerado por esbuild — sem tocar o build Next)
   - `src/shared/` = `packages/shared` (tipos e contratos compartilhados web↔extensão,
     ex.: `LeadPayload`, `ExtractSource`)
   - `docs/` = documentação/ADRs.
   Quando for para produção real, mover `src/` → `apps/web` é trivial.

6. **Pagamentos (Fase 8):** implementação completa com **modo sandbox nativo** — os
   webhooks Stripe/Mercado Pago existem, validam assinatura e são idempotentes
   (`billing_events.provider + event_id UNIQUE`), mas só entram em modo "real" quando as
   chaves existirem em env. **Pergunta ao dono: as chaves Stripe/MP existem?** Sem elas, a
   Fase 8 entrega tudo exceto o tráfego real de cobrança.

7. **E-mail (Resend):** idem — adaptador `src/server/mailer.ts` com dois backends:
   `console` (log estruturado, usado no sandbox) e `resend` (usado quando
   `RESEND_API_KEY` existir). Zero e-mail inventado.

8. **Waitlist real na Fase 1:** enquanto auth não existe (Fase 2), o CTA "Começar grátis"
   grava um registro real em `WaitlistSignup` (Prisma) — funcionalidade verdadeira, sem
   dado fake, e útil como lista de lançamento. Removível/reaproveitável depois.

## Consequências

- Positivas: zero dependência externa para desenvolver/testar tudo agora; migração
  Postgres/Supabase documentada e barata; UI não muda.
- Negativas / riscos: SQLite não suporta RLS de banco (mitigado por TenantGuard + testes);
  polling em vez de push nativo (contrato pronto para Realtime); fila em memória não
  sobrevive a restart (aceitável neste estágio; fila **persistente** do usuário fica na
  extensão/IndexedDB, como a spec manda).

## Pendências que dependem do dono (uma pergunta objetiva cada)

1. Chaves Stripe + Mercado Pago existem para a Fase 8? (se não, entregamos sandbox)
2. Domínio de produção para webhooks/CORS/OAuth? (usar placeholder de env `APP_URL`)
3. WhatsApp: follow oficial (Cloud API) é o caminho confirmado para produção?
