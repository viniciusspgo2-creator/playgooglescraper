# FASE 0 — Pesquisa de Repositórios e Técnicas (Play Google Scraper)

> Data da pesquisa: realizada via busca web ativa + leitura direta dos READMEs brutos
> (`raw.githubusercontent.com`) no ambiente de execução desta sessão.
>
> **Aviso de transparência (exigido pelo protocolo):** números de estrelas e estado de
> manutenção mudam rápido. Confira as páginas dos repositórios antes de fixar qualquer
> dependência em produção. O que está documentado abaixo é **o que foi extraído do
> conteúdo dos READMEs/issues na data desta sessão**, não um retrato permanente.

---

## 1. Repositórios pesquisados — o que foi extraído e o que aproveitamos

### 1.1 gosom/google-maps-scraper (Go) — `github.com/gosom/google-maps-scraper`

**Como foi pesquisado:** README bruto lido na íntegra + issue pública que reporta quebra de parsing.

**O que foi extraído do README:**
- Suporta **grid scraping por bounding box**: flags `-grid-bbox "minLat,minLon,maxLat,maxLon"` e
  `-grid-cell <km>` (célula padrão de **1.0 km**), exigindo `-zoom` (1–21, padrão 15).
- Aviso crítico do próprio autor: *"grid-bbox guides where searches are launched from, but
  results are not strictly clipped to the box"* → **resultados vazam fora da célula** e é
  preciso pós-filtrar por lat/lng. Isso vai direto para a nossa spec (pós-filtro obrigatório).
- `-resume` para retomar runs interrompidas após crash → base do nosso requisito de
  **fila persistente e retomada** (nós levamos ao IndexedDB na extensão + células no banco).
- `-lang` (idioma da busca), `-depth` (profundidade máxima de scroll, padrão 10),
  `-fast-mode` não combina com `-grid-bbox`.
- Throughput esperado documentado: **~120 places/min** com `-c 8 -depth 1`.
- 33+ data points por lugar (nome, telefone, website, reviews, coordenadas etc.).
- Uso de **proxies para evitar rate limiting** em jobs grandes.

**Issue extraída (evidência importante):** um issue aberto no repositório mostra o payload
acessado como `window.APP_INITIALIZATION_STATE[3]["Tf"][6]` — ou seja, **o índice/ chave do
payload muda entre versões** (chave numérica → chave ofuscada tipo `"Tf"`). Conclusão
adotada no design do nosso motor: **nunca confiar em índice fixo** — validação com Zod por
campo + fallback em cascata (payload → DOM → painel de detalhes) + telemetria por estratégia.

**Aproveitado:** grid por bbox com célula em km (reescrito como Quadtree recursiva, nossa
variação), pós-filtro por lat/lng, retomada de sessão, zoom 15 por padrão.
**Descartado:** arquitetura CLI em Go com browsers dedicados (nosso veículo é uma extensão
MV3 rodando no Chrome real do usuário — sem Puppeteer, sem proxy, sem fingerprint spoofing).

---

### 1.2 omkarcloud/google-maps-scraper (Python / botasaurus) — `github.com/omkarcloud/google-maps-scraper`

**Como foi pesquisado:** README bruto lido + confirmação externa (artigo "Best Google Maps
Scrapers on GitHub" da scrap.io apontando 50+ data points).

**O que foi extraído do README:**
- **50+ data points**, com **enriquecimento de e-mail/redes sociais visitando o site da
  empresa** — o autor mantém o módulo aberto `omkarcloud/website-email-contact-scraper`,
  que usamos como referência para o nosso passo "e-mail quando achável no site".
- **3 modos de velocidade** documentados com trade-offs explícitos: `Fastest` (~30 s por
  cidade, **30–40 resultados a menos**), `Fast` (padrão) e `Slow` (**mais resultados**, mais
  lento). Confirma a nossa tese de velocidade configurável e de que **mais devagar coleta
  mais** — refletido nos nossos 4 modos (Furtivo/Moderado/Rápido/Turbo).
- Cache e deduplicação como princípios do framework botasaurus.

**Aproveitado:** e-mail via visita ao site (pipeline separado), modos de velocidade com
trade-off documentado, dedup por place_id.
**Descartado:** desktop app Python; nuvem da omkarcloud; dependência do runtime Python.

---

### 1.3 Xetera/ghost-cursor — `github.com/Xetera/ghost-cursor`

**Como foi pesquisado:** README bruto lido na íntegra.

**O que foi extraído:**
- Movimento de mouse por **curvas de Bézier** entre coordenadas, com **overshoot**:
  *"cursor.move() will automatically overshoot or slightly miss and re-adjust for elements
  that are too far away"*.
- Ao passar sobre elementos, escolhe **um ponto aleatório dentro do elemento** (não o centro).
- **Velocidade proporcional à distância e ao tamanho do elemento** (lei de Fitts).
- Opções de clique: `hesitate` (delay antes do clique), `waitForClick` (delay
  mousedown→mouseup), `moveDelay` com randomização 0→N.

**Aproveitado:** o conceito completo (Bézier cúbica + overshoot + ponto aleatório no
elemento + velocidade por distância/tamanho). Reimplementamos em TS puro dentro da extensão
(mouse events reais do navegador — `document.dispatchEvent(new MouseEvent(...))` não é
possível de "mover cursor", então nosso humanizer usa scroll/leitura/pausas + interações
DOM nativas; a Bézier governa os alvos e os tempos).
**Descartado:** o pacote npm em si (acoplado a Puppeteer/CDP).

---

### 1.4 apify/crawlee (+ apify/google-maps-scraper) — `github.com/apify/crawlee`

**Como foi pesquisado:** README bruto lido + contexto de marketplace.

**O que foi extraído do README:**
- **Fila persistente de requests** (breadth/depth-first), **storage plugável**, **proxy
  rotation e session management** integrados, retries automáticos.
- Separação `RequestQueue` / `Dataset` / `KeyValueStore` como primitivas.

**Aproveitado:** o padrão arquitetural de **fila persistente retomável** (no nosso caso:
`search_cells` no banco + fila IndexedDB na extensão) e **session pool** (no nosso caso:
controle de sessão via circuit breaker, não via proxies).
**Descartado:** rodar Crawlee de fato — não é compatível com contexto de extensão MV3 e
exige Node/headless, que é exatamente o que queremos evitar (Chrome real do usuário é mais
"stealth" que qualquer fingerprint falso).

---

### 1.5 rebrowser/rebrowser-patches — `github.com/rebrowser/rebrowser-patches`

**Como foi pesquisado:** README bruto lido.

**O que foi extraído:**
- Patches para vazamentos de automação (ex.: **`Runtime.Enable` do CDP**, detectável por
  scripts anti-bot; referência ao artigo do DataDome sobre o sinal CDP em headless Chrome).
- O próprio README admite que a abordagem é **frágil** ("may break as the libraries' source
  code changes").

**Aproveitado:** a *lição de arquitetura*: automação headless é um braço de guerra
permanente. **Decisão de produto:** usar a extensão MV3 no **Chrome real, com perfil real,
logado, com histórico** — o melhor stealth possível, sem um único patch. Complementamos com
humanização comportamental (Bézier, log-normal, idle) + circuit breaker (CAPTCHA/429 →
backoff exponencial 30 s→2 min→8 min→30 min + downgrade automático de modo).
**Descartado:** patches/rebrowser em si (inaplicável em MV3 — não controlamos o launcher).

---

### 1.6 Documentação oficial Chrome MV3 (developer.chrome.com / grupos Chromium)

**O que foi extraído:**
- Manifest V3 **proíbe código hospedado remotamente** (todo JS do bundle precisa ser
  empacotado) — impacto direto: a extensão é self-contained e o download é gerado/serve do
  próprio painel.
- Primitivas usadas na nossa arquitetura: `chrome.sidePanel`, `chrome.offscreen` (parsing
  pesado fora da UI), `chrome.storage.session` (token **nunca** em localStorage da página),
  service worker com keep-alive por mensagem.

**Aproveitado:** arquitetura de 5 peças — `service_worker` (orquestrador/fila/HTTP),
`content_script` (ponte), `injected.js` (contexto da página, lê `APP_INITIALIZATION_STATE`),
`offscreen` (parse pesado), `sidepanel` (React + Tailwind).

---

## 2. Os 3 achados técnicos que definem o design

1. **Teto de ~120 resultados por consulta é real e estrutural.** A saída validada pelos
   projetos pesquisados é divisão geográfica (grid/quadtree) com dedup global. Nossa
   versão: Quadtree recursiva — célula ≥ 100 resultados → subdivide em 4 (profundidade
   máx. configurável, padrão 4), com pós-filtro por lat/lng (lição do gosom) e
   persistência de cada célula para retomada.
2. **Payload `APP_INITIALIZATION_STATE` é estável "o suficiente", mas não confie.** O issue
   do gosom (`[3]["Tf"][6]` em vez de índice fixo) prova que as chaves mudam. Nosso
   extractor tenta um conjunto de caminhos candidatos, valida cada campo com Zod, loga
   `source: "payload" | "dom" | "detail"` e cai para a próxima estratégia.
3. **"Website == null" é o ouro comercial.** Confirmado pela existência de enriquecimento
   de e-mail/redes nos scrapers comerciais: quem vende site quer **quem não tem site**.
   Classificação QUENTE/MORNO/FRIO + heat_score 0–100 fica no servidor (não na extensão).

---

## 3. Riscos declarados

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Google muda índices do payload | Alta (já aconteceu) | Cascata payload→DOM→detalhe + Zod por campo + telemetria de taxa por estratégia |
| CAPTCHA/429 em uso intensivo | Média | Circuit breaker com backoff exponencial + downgrade de modo + limite diário por plano |
| DOM do Maps muda seletore | Média | Seletores por aria-label/role/data-*, nunca classes ofuscadas |
| Conta do usuário sofrer restrição | Baixa/média | Modos Furtivo/Moderado como padrão; Turbo opt-in com aviso; Terms claros |
| Payload não exposto em algum fluxo | Baixa | Fallback DOM cobre; telemetria detecta em horas |
