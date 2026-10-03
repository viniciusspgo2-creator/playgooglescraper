# Fase 2 — Banco multi-tenant e Autenticação

## O que foi entregue

1. **Schema Prisma completo** (14 tabelas de negócio + waitlist da Fase 1):
   `tenants, users, api_tokens, searches, search_cells, leads, templates, campaigns,
   campaign_leads, creatives, activities, webhooks, webhook_deliveries,
   suppression_list, billing_events`. Todo `tenantId` NOT NULL com FK
   `onDelete: Cascade`; `leads` com unicidade composta `(tenantId, placeId)`;
   índices `(tenantId, heatScore)`, `(tenantId, hasSite)`, `(tenantId, stage)`,
   `(tenantId, createdAt)`. SQLite não tem enum/Json → status são String com
   valores documentados e JSON é String com sufixo `Json` (Zod nas bordas).
2. **TenantGuard** (`src/server/tenancy/tenant-guard.ts`): RLS de aplicação via
   Prisma `$extends` — injeta/valida `tenantId` em 100% das queries de modelos
   tenant-scoped e PROÍBE `findUnique/update/delete/upsert` nesses modelos.
3. **Auth própria** (ADR-003 §D2): scrypt + cookie HttpOnly assinado (HMAC-SHA256,
   `AUTH_SECRET`), `tokenVersion` para invalidação global, papéis owner/admin/member.
4. **Rotas de API**: register, login, logout, session (GET/PATCH — nome e locale),
   accept-invite, invite-info, members (GET/POST), members/[id]/disable (POST),
   tokens (GET/POST), tokens/[id] (DELETE), `POST /api/v1/auth/verify` (conexão da
   extensão, 60 req/min por token, escopo `verify`).
5. **Tokens de API**: `pgs_live_<slug>_<32 bytes hex>`, só SHA-256 persistido,
   reveal-once, escopos (`verify`, `leads:read`, `leads:write`), revogação imediata,
   métricas de uso (`lastUsedAt`, `useCount`).
6. **Convites**: cria usuário `invited` com token de 7 dias; aceite via `/?invite=…`;
   assentos respeitados; e-mail via adaptador `src/server/mailer.ts` (console no
   sandbox; Resend quando `RESEND_API_KEY` existir).
7. **UI no shell de rota única** (ADR-003 §D1): AuthDialog (login/signup/convite),
   Workspace (Visão geral com métricas reais + onboarding, Tokens & Conexão com
   teste de conexão ao vivo, Equipe com convites/desativação), idioma persistido em
   `users.locale`, dark mode, i18n 100% em pt-BR/en-US/es-ES (erros de API traduzidos
   por código no cliente). Waitlist da Fase 1 aposentada da UI (rota/tabela mantidas).
8. **Isolamento provado** por tabela: `bun run verify:isolation` — 56/56 checagens
   (leitura cruzada vazia, escrita cruzada 0 linhas, create cross-tenant bloqueado,
   findUnique proibido, place_id duplicado coexiste entre tenants).
9. **Seed rotulado**: `bun run db:seed` — tenant "Demo (SEED)", owner/admin
   (`Demo1234`), membro convidado (link impresso), 1 token (impresso UMA vez),
   6 leads rotulados `[SEED]` para as fases 5–7.

## Como rodar

```bash
bun run db:push           # aplica o schema (SQLite)
bun run db:seed           # dados [SEED] de demonstração (nunca em produção)
bun run verify:isolation  # auditoria de isolamento (56 checagens, exit 1 se falhar)
bun run dev               # http://localhost:3000
```

### Variáveis de ambiente

| Variável       | Obrigatória | Uso                                                              |
| -------------- | ----------- | ---------------------------------------------------------------- |
| `DATABASE_URL` | sim         | SQLite (`file:/home/z/my-project/db/custom.db`)                  |
| `AUTH_SECRET`  | sim (prod)  | HMAC das sessões. Já gerada no `.env` do sandbox; **em produção, gere com `openssl rand -hex 32`**. O fallback determinístico do sandbox loga aviso explícito. |
| `APP_URL`      | recomendado | Base dos links de convite (default `http://localhost:3000`)      |
| `RESEND_API_KEY` | não       | Sem ela, e-mails (convites) vão para o log estruturado (console) |

## O que foi testado (Agent Browser, end-to-end)

- Cadastro real → tenant + owner criados → sessão → workspace;
- Criação de token → reveal-once → lista com prefixo mascarado → teste de conexão
  na UI e via `curl` (200 com tenant/plano/créditos; 401 para token inválido);
- Revogação → token falha imediatamente na `/api/v1/auth/verify`;
- Convite → link `/?invite=…` → aceite (senha) → membro logado;
- Papéis: member NÃO vê botões de gestão (UI) e recebe **403** do servidor em
  `POST /api/tokens` e `POST /api/members` (testado com a sessão do membro);
- Login errado → 401 com mensagem traduzida; logout; login owner-seed;
- Idioma pt→en→es sem reload, persistido em `users.locale` (verificado no banco);
- Dark mode no workspace; mobile 390px (menu Sheet, cards empilhados); footer da
  landing com `mt-auto` (empurrado naturalmente, docH 6499);
- `verify:isolation` 56/56; `tsc --noEmit` limpo; `eslint` limpo; console sem erros
  (corrigido `workspace.overview.planLabel` encontrado durante a verificação).

## O que NÃO foi testado

- Tráfego real do Resend (sem `RESEND_API_KEY` no sandbox — backend console ativo);
- `Secure` no cookie (ativa apenas com NODE_ENV=production/HTTPS);
- Rate limit sob carga distribuída (implementação em memória local, ADR-001 §3);
- Migração para Postgres/Supabase+RLS real (mecânica; ADR-001 §1 documenta o mapa).

## Riscos e pontos de atenção

1. **`AUTH_SECRET`**: em produção é obrigatória — sem ela o fallback determinístico
   do sandbox entra em ação (com aviso no log). Rotação do segredo invalida todas
   as sessões (comportamento aceitável e desejável em incidente).
2. **Raw SQL**: `$queryRaw` não passa pelo TenantGuard — política: proibido em
   tabelas tenant-scoped (code review + auditoria cobrem).
3. **E-mail globalmente único em `users`**: um e-mail pertence a um único tenant
   (login sem seletor de organização). Se o produto exigir multi-org por e-mail,
   migra-se para `(tenantId, email)` + tela de escolha — decisão registrada aqui.
4. **Assentos**: limitados no convite (`tenant.seats`); upgrade de plano na Fase 8.
