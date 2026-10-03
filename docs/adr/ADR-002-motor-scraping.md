# ADR-002 — Motor de scraping: extração em cascata, Quadtree, humanização e circuit breaker

- **Status:** Aceito
- **Base empírica:** `docs/RESEARCH.md` (gosom, omkarcloud, ghost-cursor, crawlee, rebrowser, docs MV3)

## D1 — Extração em cascata com `source` por campo

**Decisão:** cada campo alvo (nome, telefone, website, endereço, lat/lng, plus code,
categoria(s), rating, reviews, price level, horários, fotos, claimed, place_id, CID) é
extraído por uma cascata de 3 estratégias, **sempre logando qual foi usada**:

1. `payload` — `injected.js` roda no contexto MAIN da página e lê
   `window.APP_INITIALIZATION_STATE` (e variantes da resposta JSON do Maps), envia ao
   `content_script` via `postMessage` com validação de origem. Cada campo tenta uma lista
   de **caminhos candidatos** (ex.: `[14, 11]`, `[14, "Tf"][11]`), valida com Zod e
   descarta campo inválido — nunca propaga dado do tipo errado.
2. `dom` — seletores resilientes por `aria-label` / `role` / `data-*`. Nunca classes
   ofuscadas (prova viva: o issue do gosom mostra chave `[3]["Tf"][6]` mudando).
3. `detail` — abre o card individual e lê o painel de detalhes (mais lento, mais completo).

**Motivação:** o issue público do gosom demonstra que índices mudam entre versões do
payload. Zod na fronteira + telemetria de taxa de sucesso por estratégia detecta quebra do
layout do Google **em horas**.

**Normalização:** telefone → E.164 (libphonenumber-js); website → domínio raiz +
classificação (`own` | `social` | `none`); CID extraído de `!1s`/`data` quando presente.

## D2 — Quadtree para furar o teto de ~120

**Decisão:** bounding box da cidade (Nominatim/OSM) ou polígono desenhado → células de
~3 km → `/maps/search/<termo>/@LAT,LNG,15z` por célula → se ≥ 100 resultados, subdivide em
4 (recursão, profundidade máx. padrão 4) → senão, esgota. Dedup global por `place_id` e
CID. Cada célula persiste `(search_id, bbox, depth, status, found)` para **retomar após
queda**. Progresso = `cells_done / cells_total` com ETA.

**Lição aplicada do gosom:** resultados não são clipeados à célula — pós-filtro
obrigatório por lat/lng dentro do bbox.

## D3 — Humanização (4 modos)

Distribuição **log-normal** (nunca uniforme) para delays; Bézier cúbica com overshoot
(conceito ghost-cursor); scroll `requestAnimationFrame` + easeOutCubic; micro-pausas de
leitura proporcionais ao texto do card; idle aleatório; bloqueio de imagens/fontes quando
possível. Tabela de modos e limites por plano definidos em
`extension/humanizer/profiles.ts` (Fase 4) — **fonte única de verdade**, testada
unitariamente (determinismo por seed).

## D4 — Circuit breaker

CAPTCHA | `/sorry/index` | HTTP 429 → pausa exponencial **30 s → 2 min → 8 min → 30 min**,
notifica o side panel, e ao retomar **desce um nível de velocidade** automaticamente.
Limite diário configurável por plano (aplicado no servidor via token, não só na extensão).

## D5 — Comunicação extensão ↔ sistema

- Token `pgs_live_<tenant>_<32B random>`; exibido **1×**; banco guarda **SHA-256**;
  escopos, rate limit, revogação, `last_used_at`, fingerprint de dispositivo.
- `POST /api/v1/auth/verify` → tenant, plano, créditos, limites.
- `POST /api/v1/leads/batch` (lotes de 25, gzip, `Idempotency-Key: sha256(place_id)`),
  upsert + dedup + `heat_score` calculado no servidor + evento para o painel ao vivo.
- Token vive em `chrome.storage.session` da extensão; **nunca** em localStorage de página;
  nunca exposto ao content script da página do Google.

## D6 — heat_score (servidor, 0–100)

Pesos (configuráveis por tenant, fórmula versionada em `src/server/heat-score.ts` com
testes unitários): sem site (+35), social em vez de site (+18), rating ≥ 4.0 (+12),
reviews ≥ 15 (+10), telefone E.164 válido (+10), WhatsApp válido (+8), perfil não
reivindicado (+2), categoria-alvo da campanha (+5). Classificação textual: QUENTE (sem
site) / MORNO (social/bio-link/negocio.site) / FRIO (domínio próprio).

## Riscos

- Índices do payload mudam → cascata + telemetria (D1).
- `z` 15 pode não saturar igual em áreas urbanas/rurais → `saturateThreshold` (≥100) e
  profundidade ajustáveis por tenant na Fase 4.
- MV3 service worker dorme → keep-alive por mensagens do content script + fila IndexedDB.
