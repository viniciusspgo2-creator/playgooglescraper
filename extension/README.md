# Play Google Scraper — Extensão Chrome (MV3)

Extensão que extrai leads do Google Maps e envia ao painel Play Google Scraper
via token de API (`pgs_live_…`). pt-BR na v1 (i18n da UI completa para v2 — os
textos de interface já estão isolados em `sidepanel.js`/`_locales`).

## Instalação (modo desenvolvedor)

1. Baixe o ZIP **pelo painel web** (a origem da API é injetada no download —
   não edite `config.js` à mão).
2. Descompacte o ZIP em uma pasta definitiva (a pasta não pode ser apagada
   enquanto a extensão estiver instalada).
3. Abra `chrome://extensions`, ative **Modo do desenvolvedor** (canto
   superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta descompactada.
5. Fixe a extensão na barra e clique no ícone para abrir a Side Panel.

Requerimentos: Chrome/Chromium **116+** (usa Side Panel API MV3).

## Conectar o token

1. No painel web, vá em **Tokens de API** e crie um token com escopos
   `verify` + `leads:write` (o token é exibido **uma única vez**).
2. Abra a Side Panel da extensão, cole o token no campo **Token de API** e
   clique **Conectar**.
3. O status deve ficar **Conectado** com o nome da organização, plano e
   créditos restantes.

Alternativa: se o download foi feito pela opção **conexão automática**
(POST com token), a extensão conecta sozinha na primeira abertura — o token
fica apenas no `chrome.storage.session` do service worker, nunca em
`localStorage` de páginas e nunca é exposto ao Google.

## Fluxo de busca

1. Abra `https://www.google.com/maps` em uma aba.
2. Na Side Panel, informe **termo**, **centro** (ou clique em *Usar centro da
   aba atual*), **raio (km)**, **modo de velocidade** e **profundidade máxima**.
3. Clique **Iniciar busca**. A aba do Maps passa a ser controlada pela
   extensão: navega para `/maps/search/<termo>/@lat,lng,15z`, coleta leads,
   rola o feed com pausas humanizadas e repete por célula.
4. Células com **≥ 100 resultados** são **subdivididas em 4** (Quadtree) até a
   profundidade máxima — isso fura o teto de ~120 resultados do Google.
5. Leads são enviados em **lotes de 25** com `Idempotency-Key` (reenvios não
   duplicam — dedup por `place_id` no servidor).

## Retomada e resiliência

- **Aba/rede caiu:** o estado (busca, células, fila de lotes) vive no
  `chrome.storage.session` e numa fila IndexedDB local. Basta clicar
  **Retomar**; lotes pendentes são reenviados automaticamente
  (ou em *Forçar reenvio*).
- **Créditos esgotados (402):** a busca pausa com o badge *Bloqueado por
  créditos*; os lotes ficam na fila. Ao recarregar créditos no painel, clique
  **Retomar**.
- **Rate limit (429) / CAPTCHA:** o *circuit breaker* pausa a varredura em
  30s → 2min → 8min → 30min e **desce um nível de velocidade** (turbo → fast
  → moderate → stealth) automaticamente.
- **Hibernação do service worker:** o heartbeat (alarme de 1 min) e os pings
  do content script mantêm a varredura viva; se o SW dormir, o alarme o acorda
  e o loop retoma da célula pendente.

## Modos de velocidade (delays log-normal, nunca uniformes)

| Modo     | Delay (ms)  | ~Leads/h |
| -------- | ----------- | -------- |
| stealth  | 2800–6500   | 250      |
| moderate | 1200–3000   | 700      |
| fast     | 500–1400    | 1800     |
| turbo    | 150–500     | 4000     |

## Uso responsável (importante)

- Colete **apenas dados comerciais** de negócios (nome, telefone, site,
  endereço, avaliação) — nunca dados pessoais sensíveis. LGPD: trate os dados
  com base legítima, informe titulares quando contatados e responda
  solicitações de exclusão (a exclusão via painel apaga tudo).
- Respeite os limites do seu plano e os Termos do Google Maps. Os modos
  `stealth`/`moderate` existem para espelhar comportamento humano; evite
  `turbo` em sessões longas.

## Desenvolvimento

- `config.js` em dev contém `__API_BASE__` não substituído — a extensão
  mostra erro amigável pedindo o download pelo painel. Para apontar a um
  servidor local manualmente, substitua a placeholder por `http://localhost:3000`.
- Empacotamento local (sem auth): `bun scripts/pack-extension.ts [token]` —
  gera `download/play-google-scraper-extension-v1.0.0.zip` e lista o conteúdo.
- Arquivos: `sw.js` (orquestração), `content.js` (extração DOM + navegação),
  `injected.js` (payload MAIN world), `quadtree.js` (geometria),
  `humanizer.js` (delays), `queue.js` (fila IndexedDB),
  `sidepanel.*` (UI), `_locales/` (i18n do manifest/strings).
