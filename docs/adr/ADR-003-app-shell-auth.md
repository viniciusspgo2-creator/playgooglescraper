# ADR-003 — Shell de rota única, autenticação e TenantGuard

- **Status:** Aceito
- **Data:** Fase 2
- **Decidido por:** Arquiteto-Executor

## Contexto

A Fase 2 entrega banco multi-tenant completo, autenticação, papéis, tokens de API e a
prova de isolamento. Três constraints do ambiente (ADR-001) moldam as decisões:

1. **Rota única de UI (`/`)** — landing, auth, workspace serão estados de uma mesma
   aplicação client-side.
2. **Prisma + SQLite** — sem RLS de banco; isolamento na camada de aplicação.
3. **Sem dependências nativas novas** — bcrypt nativo fora; usamos `node:crypto`.

## Decisões

### D1 — Shell de rota única (`RootExperience`)

`page.tsx` (Server Component) lê cookie de sessão + `?invite=` e monta
`<RootExperience>` (client), que alterna entre `LandingView` e `Workspace`
por estado (`view: "landing" | "app"`), sem mudar a URL. A sessão vem do
servidor na primeira render (sem flash de conteúdo logado). `?invite=<token>`
abre o AuthDialog no modo "aceitar convite" e é limpo da URL após o uso.

### D2 — Autenticação própria com cookie HttpOnly assinado (não NextAuth)

- **Senha:** scrypt (N=16384, r=8, p=1, salt 16B) via `node:crypto`, verificação
  com `timingSafeEqual`. Formato: `scrypt$<salt-b64>$<hash-b64>`.
- **Sessão:** cookie `pgs_session` HttpOnly, SameSite=Lax, Secure em produção,
  7 dias. Payload `{uid, tid, role, ver, exp}` + HMAC-SHA256 (`AUTH_SECRET`,
  32 bytes gerado no setup; produção exige variável de ambiente — fallback
  determinístico só existe para o sandbox e está documentado no README).
- **`tokenVersion`** em `users`: qualquer elevação (troca de senha, "sair de
  todos") invalida sessões antigas sem tabela de sessões.
- **Por que não NextAuth v4:** o adaptador de credenciais do NextAuth exigiria
  JWT secret próprio, callbacks e provider config para entregar exatamente
  `{tenantId, role}` no token — mais superfície para o mesmo resultado. O
  upgrade para NextAuth/Auth.js (ou Supabase Auth) fica factível porque o
  contrato `SessionPayload` é estável.

### D3 — TenantGuard: RLS de aplicação (Prisma `$extends`)

`src/server/tenancy/tenant-guard.ts` expõe `tenantDb(tenantId)` — cliente
Prisma estendido que, para todo modelo tenant-scoped:

- **create/createMany:** injeta `tenantId` (e rejeita se vier outro valor).
- **findFirst/findMany/count/aggregate/groupBy/updateMany/deleteMany:** força
  `where.AND = [...where, { tenantId }]` — impossível ler ou escrever fora do tenant.
- **Proíbe** `findUnique/findUniqueOrThrow/update/delete/upsert` nesses modelos
  (não aceitam filtro não-único → ponto de bypass clássico). Os serviços usam
  `findFirst({ id })` + `updateMany`/`deleteMany` com `tenantId` no `where`.
- Campos **JSON** (SQLite não tem tipo Json) são `String` com sufixo `Json`,
  serializados com Zod nas bordas; `categoriesText` denormaliza categorias para busca.
- A migração futura para Postgres+RLS é mecânica: mesmos nomes de tabela/coluna,
  mesmos índices compostos; o TenantGuard vira defesa-em-profundidade sob a RLS.

### D4 — Isolamento provado por script de auditoria

`bun run verify:isolation` (`scripts/verify-isolation.ts`) cria dois tenants
efêmeros e, **para cada uma das 13 tabelas tenant-scoped**, prova:
(a) leitura cruzada retorna vazio; (b) escrita cruzada afeta 0 linhas;
(c) `create` com `tenantId` de outro tenant lança `TenantScopeError`;
(d) operações proibidas lançam erro; (e) `(tenant_id, place_id)` aceita o mesmo
place_id em tenants diferentes. Falha em qualquer checagem → exit 1 → fase reprovada.
O script é idempotente e limpa os tenants de auditoria no fim.

### D5 — Tokens de API (`pgs_live_...`)

Formato `pgs_live_<slug>_<32 bytes hex>`. Armazenamos **apenas SHA-256**;
`tokenPrefix` (`pgs_live_xxx_ab12…ef34`) para exibição. Escopos na Fase 2:
`verify`, `leads:read`, `leads:write` (leads:read entra em uso na Fase 5).
Mostrado uma única vez; revogação marca `revokedAt`; uso atualiza
`lastUsedAt`/`useCount`. `POST /api/v1/auth/verify` devolve tenant/plano/créditos
(limite de 60 req/min por token) — é o endpoint de conexão da extensão (Fase 4).

### D6 — Papéis e convites

`owner` (dono, único por tenant), `admin`, `member`. Convite cria `users.status
= "invited"` + `inviteToken` (32 hex, 7 dias) — sem senha até aceitar em
`/?invite=…`. Assentos respeitam `tenant.seats`. E-mail via adaptador
`src/server/mailer.ts` (console no sandbox; Resend quando `RESEND_API_KEY`
existir) — o painel também mostra o link para cópia imediata.

### D7 — Estado no cliente

Zustand (`session-store`) para sessão/visual/diálogo de auth. Fetch de dados das
3 telas com hook `useApi` leve; TanStack Query entra na Fase 5 junto com as
tabelas virtualizadas de leads (decisão de custo/benefício, mesma interface
`useApi` até lá).

## Consequências

- Zero dados fake: onboarding real, tokens reais, convites reais (console).
- Riscos: fallback de `AUTH_SECRET` (documentado; produção exige env), guard
  de aplicação não cobre `$queryRaw` (política: proibido raw em tabela
  tenant-scoped; auditoria cobre a API), SQLite sem GIN (busca por categorias
  via `categoriesText` indexável).
- Waitlist da Fase 1 é desativada da UI (componente removido); a rota
  `/api/waitlist` e a tabela permanecem (dados reais coletados na pré-fase).
