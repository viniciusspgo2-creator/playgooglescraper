/**
 * sw.js — service worker MV3 (clássico, com importScripts) do Play Google Scraper.
 *
 * Responsabilidades:
 *  • Conexão: POST /api/v1/auth/verify com Bearer token (pgs_live_…).
 *  • Loop de varredura Quadtree: célula → PGS_SCRAPE_CELL no content script →
 *    resultado → subdivisão (≥100 resultados e depth < maxDepth) → lotes de 25
 *    leads em POST /api/v1/leads/batch com Idempotency-Key = sha256(place_ids).
 *  • Estado durável em chrome.storage.session (sobrevive a hibernação do SW;
 *    morre só quando o navegador fecha — ADR-002 D5).
 *  • Circuit breaker (ADR-002 D4): captcha | 429 | 3 erros seguidos → pausa
 *    exponencial 30s→2min→8min→30min (níveis 0..3) e desce 1 nível de speed.
 *  • Fila IndexedDB (queue.js): lotes NUNCA descartados (rede/429/402).
 *  • Heartbeat: alarmes "pgs-heartbeat" (1 min, retoma loop pós-hibernação) e
 *    "pgs-verify" (10 min, revalida token/créditos).
 */
"use strict";

/* ───────────────────── namespace global + imports ───────────────────── */

self.PGS = self.PGS || {};
/** UUID hex 32 (8–64 chars exigidos pelo schema extId). */
PGS.uuid = function () {
  if (self.crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
};
/** sha256 hex — Idempotency-Key (16–128 hex chars). */
PGS.sha256Hex = async function (text) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

importScripts("config.js", "quadtree.js", "humanizer.js", "queue.js");

/* ─────────────────────────────── constantes ─────────────────────────────── */

const CIRCUIT_DELAYS_MS = [30 * 1000, 2 * 60 * 1000, 8 * 60 * 1000, 30 * 60 * 1000];
const CELL_TIMEOUT_MS = 180 * 1000;
const BATCH_SIZE = 25;
const SYNC_FLUSH_MS = 1500; // coalescência → respeita rate limit de 60/min do sync
const SYNC_CHUNK = 200; // máx. células por chamada (schema)
const MAX_ERRORS = 20;
const LOG_LINES = 8;

/* ─────────────────────────────── estado ─────────────────────────────── */

function defaultState() {
  return {
    token: null,
    tokenPreview: null,
    apiBase: null,
    tenant: null,
    plan: null,
    credits: null,
    limits: null,
    scopes: [],
    search: null, // { id, extId, term, speedMode, maxDepth, centerLat, centerLng, radiusKm, rootBbox, statusKey? }
    cells: {}, // extId → QuadCell
    cellOrder: [],
    running: false,
    paused: false,
    creditsBlocked: false,
    searchFinished: null, // "done" | "cancelled" | "failed"
    circuit: { level: 0, until: 0, reason: null },
    leadsFound: 0,
    strategyCounts: { payload: 0, dom: 0, detail: 0 },
    pendingCell: null, // { cell, term, speedMode, reloadAttempt }
    lastCellResult: null,
    errors: [], // { at, message }
    logs: [], // últimas N linhas
    queueCount: 0,
    tabId: null,
  };
}

let S = defaultState();
let stateLoaded = false;
let loopActive = false;
let consecutiveErrors = 0;
let circuitWasActive = false;
let engine = null; // humanizer engine semeado por busca
let cellWaiter = null; // { cellExtId, resolve, timer }
const syncPending = new Map(); // extId → célula alterada
let syncTimer = null;

async function ensureLoaded() {
  if (stateLoaded) return;
  try {
    const data = await chrome.storage.session.get("state");
    if (data && data.state) S = Object.assign(defaultState(), data.state);
  } catch (_) {
    /* storage indisponível — segue com estado novo */
  }
  stateLoaded = true;
}

async function saveState() {
  try {
    await chrome.storage.session.set({ state: S });
  } catch (_) {
    /* quota/serialização — estado em memória continua válido */
  }
}

function pushLog(line) {
  S.logs.push({ at: Date.now(), line: String(line).slice(0, 200) });
  while (S.logs.length > LOG_LINES) S.logs.shift();
  console.info("[PGS]", line);
}
function pushError(message) {
  S.errors.push({ at: Date.now(), message: String(message).slice(0, 300) });
  while (S.errors.length > MAX_ERRORS) S.errors.shift();
  pushLog("ERRO: " + message);
}
function sendEvent(event, data) {
  try {
    const payload = Object.assign({ type: "PGS_EVENT", event: event }, data || {});
    const p = chrome.runtime.sendMessage(payload);
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (_) {
    /* side panel fechado */
  }
}

function getEngine() {
  const mode = S.search ? S.search.speedMode : "moderate";
  const seed = S.search ? S.search.extId : "pgs";
  if (!engine) engine = PGS.humanizer.createEngine(mode, seed);
  return engine;
}

class ScrapeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/* ─────────────────────────── configuração ─────────────────────────── */

function apiBaseConfigured() {
  return Boolean(S.apiBase) && S.apiBase.indexOf("__") === -1;
}

/* ─────────────────────────── API: verify ─────────────────────────── */

async function apiVerify(token, apiBase) {
  const res = await fetch(apiBase + "/api/v1/auth/verify", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.ok) {
    const err = (data && data.error) || { code: "verify_failed", message: "Falha ao verificar o token (HTTP " + res.status + ")." };
    throw Object.assign(new Error(err.message), { code: err.code });
  }
  return data;
}

/* ─────────────────────────── API: search/sync ─────────────────────────── */

function wireCell(cell) {
  return {
    extId: cell.extId,
    depth: cell.depth,
    latMin: cell.latMin,
    lngMin: cell.lngMin,
    latMax: cell.latMax,
    lngMax: cell.lngMax,
    status: cell.status,
    found: cell.found || 0,
    attempts: cell.attempts || 0,
    lastError: cell.lastError || null,
  };
}

function searchStatus() {
  if (S.searchFinished) return S.searchFinished;
  if (S.paused) return "paused";
  if (S.running) return "running";
  return "queued";
}

function buildSyncBody(cells) {
  const progress = PGS.quadtree.progress(S);
  return {
    search: {
      extId: S.search.extId,
      term: S.search.term,
      status: searchStatus(),
      speedMode: S.search.speedMode,
      bbox: S.search.rootBbox,
      centerLat: S.search.centerLat,
      centerLng: S.search.centerLng,
      radiusKm: S.search.radiusKm,
      maxDepth: S.search.maxDepth,
      cellsTotal: progress.total,
      cellsDone: progress.done,
      leadsFound: S.leadsFound,
    },
    cells: cells.map(wireCell),
  };
}

async function postSync(body) {
  const res = await fetch(S.apiBase + "/api/v1/search/sync", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + S.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.ok) {
    const err = (data && data.error) || { code: "sync_failed", message: "sync HTTP " + res.status };
    throw Object.assign(new Error(err.message), { code: err.code });
  }
  if (data.search && data.search.id) S.search.id = data.search.id;
  if (Array.isArray(data.cells)) {
    for (const mapped of data.cells) {
      const local = S.cells[mapped.extId];
      if (local && mapped.id) local.serverId = mapped.id;
    }
  }
  return data;
}

/** Agenda flush coalescido das células alteradas (≤ 40 req/min). */
function scheduleSync(cells) {
  for (const cell of cells || []) syncPending.set(cell.extId, cell);
  if (syncTimer) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    flushSync(false).catch(() => {});
  }, SYNC_FLUSH_MS);
}

/**
 * Envia as células pendentes (em blocos de ≤200). force=true aguarda e envia
 * mesmo com a fila de flush vazia (status da busca).
 * @returns {Promise<boolean>} true se todas as chamadas passaram
 */
async function flushSync(force) {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (!S.search) return true;
  if (!force && syncPending.size === 0) return true;
  let cells = Array.from(syncPending.values());
  if (force) {
    const seen = new Set(cells.map((c) => c.extId));
    for (const extId of S.cellOrder) {
      const cell = S.cells[extId];
      if (cell && !seen.has(extId)) {
        cells.push(cell);
        seen.add(extId);
      }
    }
  }
  syncPending.clear();
  if (cells.length === 0) cells = [];

  let ok = true;
  for (let i = 0; i < Math.max(cells.length, 1); i += SYNC_CHUNK) {
    const chunk = cells.slice(i, i + SYNC_CHUNK);
    if (chunk.length === 0 && !force) continue;
    try {
      await postSync(buildSyncBody(chunk));
    } catch (err) {
      ok = false;
      if (err && err.code === "invalid_token") {
        S.paused = true;
        pushError("Token inválido/revogado — busca pausada.");
        sendEvent("token_invalid");
      } else {
        pushError("sync falhou: " + (err && err.message ? err.message : err));
      }
      for (const cell of chunk) syncPending.set(cell.extId, cell); // reagenda
      if (force && !S.search.id && err && (err.code === "invalid_token" || err.code === "missing_scope" || err.code === "validation_error")) {
        throw err; // primeira sync é obrigatória (obtém searchId)
      }
      if (force) throw err; // chamador decide (startSearch precisa do searchId)
      break;
    }
  }
  return ok;
}

/* ─────────────────────────── API: leads/batch ─────────────────────────── */

function clampStr(v, max) {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed.slice(0, max) : null;
}
function clampNum(v, min, max, isInt) {
  if (typeof v !== "number" || !isFinite(v)) return null;
  const n = isInt ? Math.round(v) : v;
  if (n < min || n > max) return null;
  return n;
}

/** Converte lead do content script → item do contrato /api/v1/leads/batch. */
function toBatchItem(lead, cell) {
  const categories = (Array.isArray(lead.categories) ? lead.categories : [])
    .slice(0, 20)
    .map((c) => clampStr(String(c), 128))
    .filter(Boolean);
  const sourcesIn = lead.sources || {};
  const sources = {};
  if (Array.isArray(sourcesIn.payload) && sourcesIn.payload.length > 0) {
    sources.payload = sourcesIn.payload.slice(0, 20).map((f) => String(f).slice(0, 64));
  }
  if (Array.isArray(sourcesIn.dom) && sourcesIn.dom.length > 0) {
    sources.dom = sourcesIn.dom.slice(0, 20).map((f) => String(f).slice(0, 64));
  }
  return {
    place_id: clampStr(lead.place_id, 512),
    cid: clampStr(lead.cid, 128),
    name: clampStr(lead.name, 256),
    phone_e164: clampStr(lead.phone_e164, 32),
    phone_raw: clampStr(lead.phone_raw, 32),
    website: clampStr(lead.website, 512),
    website_type: lead.website_type === "social" || lead.website_type === "own" ? lead.website_type : "none",
    email: clampStr(lead.email, 254),
    address: clampStr(lead.address, 512),
    lat: clampNum(lead.lat, -90, 90, false),
    lng: clampNum(lead.lng, -180, 180, false),
    plus_code: clampStr(lead.plus_code, 64),
    category: clampStr(lead.category, 128),
    categories: categories,
    rating: clampNum(lead.rating, 0, 5, false),
    reviews_count: clampNum(lead.reviews_count, 0, 10000000, true),
    price_level: clampNum(lead.price_level, 0, 4, true),
    photos_count: clampNum(lead.photos_count, 0, 100000, true),
    claimed: typeof lead.claimed === "boolean" ? lead.claimed : null,
    search_id: S.search ? S.search.id : "",
    cell_id: cell && cell.serverId ? cell.serverId : null,
    sources: sources,
  };
}

/**
 * Envia um lote. Em 402/429/rede o lote vai para a fila IndexedDB
 * (NUNCA descartado). @returns {Promise<boolean>} true se aceito.
 */
async function sendBatch(items) {
  if (!items || items.length === 0) return true;
  const leads = items.filter((i) => i.place_id && i.name);
  if (leads.length === 0) return true;
  const idempotencyKey = await PGS.sha256Hex(JSON.stringify(leads.map((l) => l.place_id)));
  try {
    const res = await fetch(S.apiBase + "/api/v1/leads/batch", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + S.token,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ leads: leads }),
    });

    if (res.status === 402) {
      const data = await res.json().catch(() => null);
      if (data && data.credits) S.credits = { limit: S.credits ? S.credits.limit : 0, used: S.credits ? S.credits.used : 0, remaining: data.credits.remaining };
      await PGS.queue.enqueueBatch({ leads: leads }, idempotencyKey);
      S.queueCount = await PGS.queue.pendingCount();
      S.creditsBlocked = true;
      S.paused = true;
      pushLog("Créditos esgotados (402) — busca pausada; lote salvo na fila local.");
      sendEvent("credits_exhausted", { remaining: data && data.credits ? data.credits.remaining : 0 });
      return false;
    }
    if (res.status === 429) {
      await PGS.queue.enqueueBatch({ leads: leads }, idempotencyKey);
      S.queueCount = await PGS.queue.pendingCount();
      tripCircuit("rate_limited");
      return false;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const code = data && data.error ? data.error.code : "http_" + res.status;
      if (code === "invalid_token" || res.status === 401) {
        await PGS.queue.enqueueBatch({ leads: leads }, idempotencyKey);
        S.queueCount = await PGS.queue.pendingCount();
        S.paused = true;
        pushError("Token inválido/revogado (401) — busca pausada; lote na fila local.");
        sendEvent("token_invalid");
        return false;
      }
      pushError("Lote recusado (" + code + ").");
      return false;
    }

    const data = await res.json();
    if (data.credits && typeof data.credits.remaining === "number") {
      S.credits = {
        limit: S.credits ? S.credits.limit : 0,
        used: S.credits ? S.credits.used : 0,
        remaining: data.credits.remaining,
      };
    }
    pushLog("Lote aceito: +" + (data.created || 0) + " novos, " + (data.updated || 0) + " atualizados (créditos: " + (S.credits ? S.credits.remaining : "?") + ").");
    sendEvent("leads_batch", {
      created: data.created || 0,
      updated: data.updated || 0,
      remaining: S.credits ? S.credits.remaining : null,
    });
    return true;
  } catch (err) {
    // rede caiu — fila IndexedDB + drain com backoff do loop
    await PGS.queue.enqueueBatch({ leads: leads }, idempotencyKey);
    S.queueCount = await PGS.queue.pendingCount();
    pushError("Rede falhou — lote salvo na fila local (" + ((err && err.message) || err) + ").");
    return false;
  }
}

/** Drena a fila local (ordem FIFO; para no primeiro erro). */
async function drainQueueInternal() {
  S.queueCount = await PGS.queue.pendingCount();
  if (S.queueCount === 0) return;
  if (!S.token || !apiBaseConfigured()) return;
  const result = await PGS.queue.drainQueue(async (body, key) => {
    try {
      const res = await fetch(S.apiBase + "/api/v1/leads/batch", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + S.token,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.credits && typeof data.credits.remaining === "number") {
          S.credits = { limit: S.credits ? S.credits.limit : 0, used: S.credits ? S.credits.used : 0, remaining: data.credits.remaining };
        }
        return true; // aceito → apaga da fila
      }
      if (res.status === 422) return true; // inválido — reenviar não adianta
      if (res.status === 402 || res.status === 429 || res.status === 401) return false;
      return false;
    } catch (_) {
      return false;
    }
  });
  if (result.drained > 0) {
    pushLog("Fila local reenviada: " + result.drained + " lote(s).");
    sendEvent("queue_drained", { drained: result.drained });
  }
  S.queueCount = result.remaining;
  await saveState();
}

/* ─────────────────────────── circuit breaker ─────────────────────────── */

function tripCircuit(reason) {
  const level = Math.min(S.circuit.level + 1, 3);
  const delay = CIRCUIT_DELAYS_MS[level];
  S.circuit = { level: level, until: Date.now() + delay, reason: reason };
  const previous = S.search ? S.search.speedMode : "moderate";
  if (S.search) S.search.speedMode = PGS.humanizer.downgradeSpeed(S.search.speedMode);
  engine = null; // recria com o novo modo
  pushLog("Circuit breaker nível " + level + " — pausa " + Math.round(delay / 1000) + "s (" + reason + "). Velocidade " + previous + " → " + (S.search ? S.search.speedMode : previous) + ".");
  sendEvent("circuit_breaker", {
    level: level,
    reason: reason,
    until: S.circuit.until,
    speedMode: S.search ? S.search.speedMode : previous,
  });
  saveState();
}

/* ─────────────────────────── abas / content script ─────────────────────────── */

function isMapsUrl(url) {
  return (
    typeof url === "string" &&
    (/^https:\/\/www\.google\.[a-z.]+\/maps/.test(url) || /^https:\/\/maps\.google\.[a-z.]+/.test(url))
  );
}

async function ensureMapsTab() {
  if (S.tabId !== null && S.tabId !== undefined) {
    try {
      const tab = await chrome.tabs.get(S.tabId);
      if (tab && isMapsUrl(tab.url)) return tab.id;
    } catch (_) {
      /* aba fechada */
    }
    S.tabId = null;
  }
  try {
    const active = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    for (const tab of active) {
      if (tab && isMapsUrl(tab.url)) {
        S.tabId = tab.id;
        return tab.id;
      }
    }
    const all = await chrome.tabs.query({});
    for (const tab of all) {
      if (tab && isMapsUrl(tab.url)) {
        S.tabId = tab.id;
        return tab.id;
      }
    }
  } catch (_) {
    /* sem permissão de janelas — segue com null */
  }
  return null;
}

async function ensureContentInjected(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tabId }, files: ["content.js"] });
    return true;
  } catch (err) {
    // Página ainda carregando / em navegação — o manifest re-injeta sozinho e a
    // retomada via PGS_GET_PENDING cobre o caso.
    pushLog("Injeção adiantada falhou (retomada cobre): " + String((err && err.message) || err).slice(0, 120));
    return false;
  }
}

/* ─────────────────────────── células / loop ─────────────────────────── */

function nextPendingCell() {
  for (const extId of S.cellOrder) {
    const cell = S.cells[extId];
    if (cell && cell.status === "pending") return extId;
  }
  return null;
}

function clearWaiter() {
  if (cellWaiter) {
    clearTimeout(cellWaiter.timer);
    cellWaiter = null;
  }
}

async function requestCellScrape(cell) {
  S.pendingCell = { cell: wireCell(cell), term: S.search.term, speedMode: S.search.speedMode, reloadAttempt: 0 };
  S.lastCellResult = null;
  await saveState();

  const tabId = await ensureMapsTab();
  if (!tabId) {
    throw new ScrapeError("sem_aba_maps", "Nenhuma aba do Google Maps aberta — abra o Maps e clique em Retomar.");
  }
  await ensureContentInjected(tabId);
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "PGS_SCRAPE_CELL",
      cell: wireCell(cell),
      term: S.search.term,
      speedMode: S.search.speedMode,
    });
  } catch (_) {
    // Content script pode estar em navegação iniciada por comando anterior;
    // a instância re-injetada retoma via PGS_GET_PENDING.
  }

  return new Promise((resolve, reject) => {
    if (S.lastCellResult && S.lastCellResult.cellExtId === cell.extId) {
      const result = S.lastCellResult;
      S.lastCellResult = null;
      resolve(result);
      return;
    }
    cellWaiter = {
      cellExtId: cell.extId,
      resolve: resolve,
      timer: setTimeout(() => {
        if (cellWaiter && cellWaiter.cellExtId === cell.extId) {
          cellWaiter = null;
          reject(new ScrapeError("cell_timeout", "Célula excedeu " + CELL_TIMEOUT_MS / 1000 + "s sem resposta do content script."));
        }
      }, CELL_TIMEOUT_MS),
    };
  });
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function processCellResult(cell, result) {
  cell.attempts += 1;

  if (result.captchaDetected) {
    tripCircuit("captcha");
    cell.status = "pending"; // reprocessa após a pausa
    scheduleSync([cell]);
    await saveState();
    return;
  }

  const found = result.resultCount || 0;
  cell.found = found;
  S.strategyCounts.payload += (result.strategyCounts && result.strategyCounts.payload) || 0;
  S.strategyCounts.dom += (result.strategyCounts && result.strategyCounts.dom) || 0;
  S.strategyCounts.detail += (result.strategyCounts && result.strategyCounts.detail) || 0;

  // D2: ≥100 resultados e profundidade disponível → subdivide em 4
  const changed = [cell];
  if (found >= PGS.quadtree.SATURATE_THRESHOLD && cell.depth < S.search.maxDepth) {
    cell.status = "saturated";
    const children = PGS.quadtree.subdivide(cell);
    for (const child of children) {
      S.cells[child.extId] = child;
      S.cellOrder.push(child.extId);
      changed.push(child);
    }
    pushLog("Célula saturada (" + found + " leads) — subdividida em 4 (depth " + cell.depth + " → " + (cell.depth + 1) + ").");
  } else {
    cell.status = "exhausted";
    pushLog("Célula esgotada: " + found + " leads (depth " + cell.depth + ").");
  }

  // leads em lotes de 25 → /api/v1/leads/batch
  const items = (result.leads || []).map((lead) => toBatchItem(lead, cell));
  let queued = 0;
  for (const part of chunk(items, BATCH_SIZE)) {
    const accepted = await sendBatch(part);
    if (!accepted) {
      queued += 1;
      break; // sendBatch já enfileirou e sinalizou (402/429/rede)
    }
  }
  S.leadsFound += items.length;

  scheduleSync(changed);
  if (queued > 0 && S.creditsBlocked) {
    pushLog("Lotes restantes desta célula ficam na fila até os créditos voltarem.");
  }
  await saveState();
}

async function markSearchFinished(status) {
  if (S.searchFinished) return;
  S.searchFinished = status;
  S.running = false;
  S.paused = false;
  S.pendingCell = null;
  S.lastCellResult = null;
  clearWaiter();
  try {
    await flushSync(true);
  } catch (_) {
    /* melhor esforço — estado local já é final */
  }
  pushLog(status === "done" ? "Busca concluída — todas as células processadas." : "Busca " + status + ".");
  sendEvent("search_finished", { status: status, leadsFound: S.leadsFound });
  await saveState();
}

async function runLoop() {
  if (loopActive) return;
  loopActive = true;
  try {
    // células "running" órfãs (SW hibernou no meio) voltam para a fila
    for (const cell of Object.values(S.cells)) {
      if (cell.status === "running") cell.status = "pending";
    }
    getEngine();
    pushLog("Loop de varredura ativo (" + S.search.speedMode + ").");

    // resultado que chegou enquanto o SW estava reiniciando
    if (S.lastCellResult) {
      const cell = S.cells[S.lastCellResult.cellExtId];
      const stashed = S.lastCellResult;
      S.lastCellResult = null;
      if (cell) await processCellResult(cell, stashed);
    }

    while (S.running) {
      await saveState();
      if (!S.running) break;
      if (S.paused) {
        await PGS.humanizer.sleepMs(1500);
        continue;
      }

      const now = Date.now();
      if (S.circuit.until > now) {
        circuitWasActive = true;
        await PGS.humanizer.sleepMs(Math.min(S.circuit.until - now, 5000));
        continue;
      }
      if (circuitWasActive) {
        circuitWasActive = false;
        pushLog("Pausa do circuit breaker expirada — retomando.");
        sendEvent("circuit_resume", { level: S.circuit.level });
      }

      try {
        await drainQueueInternal();
      } catch (_) {
        /* fila é best-effort aqui; falhas reais re-enfileiram */
      }
      if (S.creditsBlocked) {
        S.paused = true;
        pushLog("Pausado: créditos esgotados. Recarregue os créditos e clique Retomar.");
        sendEvent("credits_exhausted", { remaining: S.credits ? S.credits.remaining : 0 });
        await saveState();
        continue;
      }

      const extId = nextPendingCell();
      if (!extId) {
        await markSearchFinished("done");
        break;
      }
      const cell = S.cells[extId];
      if (!cell) continue;

      cell.status = "running";
      scheduleSync([cell]);

      let result = null;
      try {
        result = await requestCellScrape(cell);
      } catch (err) {
        cell.attempts += 1;
        if (err && err.code === "sem_aba_maps") {
          S.paused = true;
          pushError(err.message);
          sendEvent("search_paused", { reason: "sem_aba_maps" });
          await saveState();
          continue;
        }
        if (cell.attempts >= 3) {
          cell.status = "failed";
          cell.lastError = String((err && err.message) || err).slice(0, 300);
          pushError("Célula falhou " + cell.attempts + "× — marcada como failed.");
        } else {
          cell.status = "pending";
          pushLog("Célula falhou (tentativa " + cell.attempts + "/3) — reenfileirada.");
        }
        consecutiveErrors += 1;
        if (consecutiveErrors >= 3) {
          tripCircuit("erros_seguidos");
          consecutiveErrors = 0;
        }
        scheduleSync([cell]);
        await saveState();
        continue;
      }

      await processCellResult(cell, result);
      consecutiveErrors = 0;
      // respiração humanizada entre células
      await PGS.humanizer.sleepMs(getEngine().nextDelay());
    }
  } catch (err) {
    pushError("Loop interrompido: " + String((err && err.message) || err));
    await saveState();
  } finally {
    loopActive = false;
  }
}

/* ─────────────────────────── handlers do hub ─────────────────────────── */

async function handleConnect(msg) {
  let token = typeof msg.token === "string" ? msg.token.trim() : "";
  if (msg.useEmbedded && PGS_CONFIG && typeof PGS_CONFIG.embeddedToken === "string") {
    token = PGS_CONFIG.embeddedToken;
  }
  let apiBase = typeof msg.apiBase === "string" && msg.apiBase.trim() ? msg.apiBase.trim() : (PGS_CONFIG && PGS_CONFIG.apiBase) || "";
  apiBase = apiBase.replace(/\/+$/, "");
  if (!apiBase || apiBase.indexOf("__") !== -1) {
    return {
      ok: false,
      error: { code: "not_configured", message: "Extensão sem configuração. Baixe o pacote pelo painel web (a origem é injetada no download)." },
    };
  }
  if (!token || token.indexOf("pgs_live_") !== 0 || token.length < 16) {
    return { ok: false, error: { code: "invalid_token", message: "Token inválido — deve começar com pgs_live_ e ter o tamanho completo." } };
  }
  try {
    const data = await apiVerify(token, apiBase);
    S.token = token;
    S.apiBase = apiBase;
    S.tenant = data.tenant;
    S.plan = data.plan;
    S.credits = data.credits;
    S.limits = data.limits;
    S.scopes = data.token ? data.token.scopes || [] : [];
    S.tokenPreview = token.slice(0, 12) + "…" + token.slice(-4);
    S.creditsBlocked = S.credits ? S.credits.remaining <= 0 : false;
    pushLog("Conectado: " + data.tenant.name + " (plano " + data.plan + ", créditos " + data.credits.remaining + ").");
    sendEvent("connected");
    await saveState();
    return { ok: true, tenant: data.tenant, plan: data.plan, credits: data.credits, scopes: S.scopes };
  } catch (err) {
    const code = (err && err.code) || "network_error";
    const message = err && err.code ? err.message : "Sem resposta do servidor — verifique a URL/origem e sua conexão.";
    return { ok: false, error: { code: code, message: message } };
  }
}

async function handleStartSearch(msg) {
  if (!S.token || !S.tenant) {
    return { ok: false, error: { code: "not_connected", message: "Conecte o token antes de iniciar uma busca." } };
  }
  if (!apiBaseConfigured()) {
    return { ok: false, error: { code: "not_configured", message: "Extensão sem configuração — baixe o pacote pelo painel web." } };
  }
  const term = typeof msg.term === "string" ? msg.term.trim().slice(0, 200) : "";
  const centerLat = Number(msg.centerLat);
  const centerLng = Number(msg.centerLng);
  const radiusKm = Number(msg.radiusKm);
  const speedMode = PGS.humanizer.PROFILES[msg.speedMode] ? msg.speedMode : "moderate";
  const maxDepth = Math.min(Math.max(Number(msg.maxDepth) || 4, 1), 6);
  if (!term) return { ok: false, error: { code: "validation", message: "Informe o termo de busca (ex.: dentistas)." } };
  if (Math.abs(centerLat) < 1 && Math.abs(centerLng) < 1) {
    return { ok: false, error: { code: "validation", message: "Centro 0,0 fica no oceano (Golfo da Guiné). Informe a latitude/longitude da sua cidade (ex.: Goiânia = -16.6869 / -49.2648; no Brasil ambos são negativos)." } };
  }
  if (!isFinite(centerLat) || centerLat < -90 || centerLat > 90 || !isFinite(centerLng) || centerLng < -180 || centerLng > 180) {
    return { ok: false, error: { code: "validation", message: "Centro inválido — informe latitude/longitude (ou use o centro da aba atual)." } };
  }
  if (!isFinite(radiusKm) || radiusKm < 0.1 || radiusKm > 500) {
    return { ok: false, error: { code: "validation", message: "Raio deve estar entre 0,1 e 500 km." } };
  }
  if (S.scopes.indexOf("leads:write") === -1) {
    return { ok: false, error: { code: "missing_scope", message: "O token não tem escopo leads:write — crie outro token no painel." } };
  }
  const tabId = await ensureMapsTab();
  if (!tabId) {
    return { ok: false, error: { code: "no_maps_tab", message: "Abra https://www.google.com/maps em uma aba antes de iniciar." } };
  }

  const searchExtId = PGS.uuid();
  const root = PGS.quadtree.makeRoot(centerLat, centerLng, radiusKm);
  S.search = {
    id: null,
    extId: searchExtId,
    term: term,
    speedMode: speedMode,
    maxDepth: maxDepth,
    centerLat: centerLat,
    centerLng: centerLng,
    radiusKm: radiusKm,
    rootBbox: { latMin: root.latMin, lngMin: root.lngMin, latMax: root.latMax, lngMax: root.lngMax },
  };
  S.cells = {};
  S.cells[root.extId] = root;
  S.cellOrder = [root.extId];
  S.running = true;
  S.paused = false;
  S.creditsBlocked = false;
  S.searchFinished = null;
  S.circuit = { level: 0, until: 0, reason: null };
  S.leadsFound = 0;
  S.strategyCounts = { payload: 0, dom: 0, detail: 0 };
  S.pendingCell = null;
  S.lastCellResult = null;
  S.errors = [];
  S.tabId = tabId;
  consecutiveErrors = 0;
  circuitWasActive = false;
  engine = PGS.humanizer.createEngine(speedMode, searchExtId);

  try {
    await flushSync(true); // primeira sync — obtém searchId e cellId do servidor
  } catch (err) {
    S.running = false;
    await saveState();
    return { ok: false, error: { code: (err && err.code) || "sync_failed", message: "Sync inicial falhou: " + ((err && err.message) || err) } };
  }
  pushLog("Busca '" + term + "' criada (raio " + radiusKm + " km, " + speedMode + ", profundidade " + maxDepth + ").");
  sendEvent("search_started", { term: term, speedMode: speedMode });

  await ensureContentInjected(tabId); // idempotente no content script
  runLoop(); // async — responde imediatamente
  return { ok: true, search: { extId: searchExtId, term: term, speedMode: speedMode } };
}

async function handlePause() {
  if (!S.running) return { ok: false, error: { code: "not_running", message: "Nenhuma busca em andamento." } };
  S.paused = true;
  pushLog("Busca pausada pelo operador.");
  sendEvent("search_paused", { reason: "operator" });
  try {
    await flushSync(true);
  } catch (_) {
    /* melhor esforço */
  }
  await saveState();
  return { ok: true };
}

async function handleResume() {
  if (!S.search) return { ok: false, error: { code: "no_search", message: "Nenhuma busca para retomar." } };
  if (S.creditsBlocked) {
    try {
      const data = await apiVerify(S.token, S.apiBase);
      S.tenant = data.tenant;
      S.plan = data.plan;
      S.credits = data.credits;
      S.limits = data.limits;
      if (S.credits.remaining <= 0) {
        return { ok: false, error: { code: "credits_exhausted", message: "Créditos ainda esgotados — recarregue no painel web." } };
      }
      S.creditsBlocked = false;
    } catch (err) {
      return { ok: false, error: { code: (err && err.code) || "verify_failed", message: (err && err.message) || "Falha ao revalidar créditos." } };
    }
  }
  S.paused = false;
  if (S.searchFinished && S.searchFinished !== "done") {
    // busca cancelada pode ser reaberta como nova execução
    S.searchFinished = null;
  }
  pushLog("Busca retomada.");
  sendEvent("search_resumed");
  await saveState();
  runLoop();
  return { ok: true };
}

async function handleStop() {
  if (!S.search) return { ok: false, error: { code: "no_search", message: "Nenhuma busca para parar." } };
  await markSearchFinished("cancelled");
  return { ok: true };
}

function stateSnapshot() {
  const progress = PGS.quadtree.progress(S);
  return {
    ok: true,
    connected: Boolean(S.token && S.tenant),
    embedded: Boolean(PGS_CONFIG && typeof PGS_CONFIG.embeddedToken === "string" && PGS_CONFIG.embeddedToken.indexOf("pgs_live_") === 0),
    notConfigured: !apiBaseConfigured() && !S.apiBase,
    apiBase: S.apiBase,
    tokenPreview: S.tokenPreview,
    tenant: S.tenant,
    plan: S.plan,
    credits: S.credits,
    limits: S.limits,
    scopes: S.scopes,
    search: S.search
      ? {
          extId: S.search.extId,
          term: S.search.term,
          speedMode: S.search.speedMode,
          maxDepth: S.search.maxDepth,
          centerLat: S.search.centerLat,
          centerLng: S.search.centerLng,
          radiusKm: S.search.radiusKm,
        }
      : null,
    progress: progress,
    running: S.running,
    paused: S.paused,
    creditsBlocked: S.creditsBlocked,
    searchFinished: S.searchFinished,
    circuit: S.circuit,
    leadsFound: S.leadsFound,
    strategyCounts: S.strategyCounts,
    errors: S.errors.slice(-MAX_ERRORS),
    logs: S.logs.slice(-LOG_LINES),
    queueCount: S.queueCount || 0,
  };
}

async function handleMessage(msg, sender) {
  await ensureLoaded();
  switch (msg.type) {
    case "connect":
      return handleConnect(msg);
    case "startSearch":
      return handleStartSearch(msg);
    case "pauseSearch":
      return handlePause();
    case "resumeSearch":
      return handleResume();
    case "stopSearch":
      return handleStop();
    case "getState":
      return stateSnapshot();
    case "clearErrors":
      S.errors = [];
      await saveState();
      return { ok: true };
    case "getQueueCount":
      return { ok: true, count: await PGS.queue.pendingCount() };
    case "drainQueue":
      await drainQueueInternal();
      return { ok: true, count: S.queueCount };
    case "PGS_DELAY": {
      const ms = getEngine().nextFor({ kind: msg.kind, textLen: msg.textLen });
      return { ok: true, ms: ms };
    }
    case "PGS_PING":
      return { ok: true, pong: true };
    case "PGS_SAVE_PENDING":
      S.pendingCell = msg.pending || null;
      await saveState();
      return { ok: true };
    case "PGS_GET_PENDING": {
      if (!S.running || !S.pendingCell) return { ok: true, pending: null };
      // só a aba controlada retoma (ou quando ainda não mapeamos a aba)
      if (sender && sender.tab && S.tabId !== null && sender.tab.id !== S.tabId) {
        return { ok: true, pending: null };
      }
      return { ok: true, pending: S.pendingCell };
    }
    case "PGS_CELL_RESULT": {
      const result = {
        cellExtId: msg.cellExtId,
        leads: msg.leads || [],
        resultCount: msg.resultCount || 0,
        strategyCounts: msg.strategyCounts || { payload: 0, dom: 0, detail: 0 },
        captchaDetected: Boolean(msg.captchaDetected),
        endReached: Boolean(msg.endReached),
        lastError: msg.lastError || null,
      };
      S.pendingCell = null;
      if (cellWaiter && cellWaiter.cellExtId === result.cellExtId) {
        clearWaiter();
        cellWaiter.resolve(result);
      } else {
        S.lastCellResult = result; // SW reiniciou — o loop consome ao acordar
      }
      await saveState();
      return { ok: true };
    }
    default:
      return { ok: false, error: { code: "unknown_command", message: "Comando desconhecido: " + msg.type } };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender)
    .then((response) => sendResponse(response))
    .catch((err) => {
      sendResponse({ ok: false, error: { code: "sw_error", message: String((err && err.message) || err) } });
    });
  return true; // resposta assíncrona
});

/* ─────────────────────────── alarmes / ciclo de vida ─────────────────────────── */

chrome.alarms.create("pgs-heartbeat", { periodInMinutes: 1 });
chrome.alarms.create("pgs-verify", { periodInMinutes: 10 });

chrome.alarms.onAlarm.addListener((alarm) => {
  handleMessage({ type: "getState" }, null).then(async (snapshot) => {
    if (!S.running || loopActive) return;
    // SW acordou após hibernação — retoma o loop da busca
    pushLog("Heartbeat: retomando loop após hibernação do service worker.");
    await ensureLoaded();
    runLoop();
  });
  if (alarm && alarm.name === "pgs-verify") {
    periodicVerify();
  }
});

async function periodicVerify() {
  await ensureLoaded();
  if (!S.token || !apiBaseConfigured()) return;
  try {
    const data = await apiVerify(S.token, S.apiBase);
    S.tenant = data.tenant;
    S.plan = data.plan;
    S.credits = data.credits;
    S.limits = data.limits;
    S.scopes = data.token ? data.token.scopes || [] : [];
    if (S.creditsBlocked && S.credits.remaining > 0) {
      S.creditsBlocked = false;
      pushLog("Créditos recarregados no servidor — fila liberada.");
    }
    sendEvent("credits_refreshed", { remaining: S.credits.remaining });
    await saveState();
  } catch (err) {
    if (err && err.code === "invalid_token") {
      pushError("Revalidação falhou: token inválido/revogado.");
      S.paused = true;
      await saveState();
      sendEvent("token_invalid");
    }
    // outros erros: rede — a fila IndexedDB cobre os lotes
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

// Em todo despertar do SW: comportamento do action + estado carregado.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
ensureLoaded();
