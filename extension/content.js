/**
 * content.js — content script (isolated world) do Play Google Scraper (Fase 4).
 *
 * Responsabilidades:
 *  1. Receber PGS_SCRAPE_CELL do service worker, navegar a aba para
 *     /maps/search/<termo>/@lat,lng,15z e aguardar o feed (div[role="feed"]).
 *  2. Injetar injected.js no MAIN world (script tag + web_accessible_resources)
 *     e receber o payload via postMessage (fonte "payload").
 *  3. Fallback DOM (fonte "dom"): seletores SOMENTE por aria/role/data-* —
 *     nunca classes ofuscadas (lição ADR-002 D1).
 *  4. PÓS-FILTRO OBRIGATÓRIO por bbox (lição gosom: resultados vazam da célula).
 *  5. Scroll humanizado (rAF easeOutCubic + micro-pausas de leitura). Os delays
 *     vêm do service worker (PGS_DELAY → humanizer log-normal) — fonte única.
 *  6. Keep-alive: PGS_PING a cada 20s enquanto o scrape está ativo (impede o
 *     service worker de dormir no meio da varredura — ADR-002 riscos).
 *  7. Retomada: antes de navegar salva pendingCell no sw (storage.session);
 *     a instância re-injetada após a navegação pergunta PGS_GET_PENDING e
 *     continua da célula pendente (crash-safe).
 *
 * Resultado: PGS_CELL_RESULT {cellExtId, leads, resultCount, strategyCounts,
 * captchaDetected, endReached, lastError} para o service worker.
 */
(function () {
  "use strict";
  if (globalThis.__PGS_CONTENT_INJECTED__) return;
  globalThis.__PGS_CONTENT_INJECTED__ = true;

  /* ─────────────────────────────── estado ─────────────────────────────── */

  let payloadPlaces = []; // lugares vindos do injected.js (MAIN world)
  let workingCellExtId = null;
  let pingTimer = null;

  const FEED_WAIT_MS = 15000;
  const MAX_SCROLL_STEPS = 200;
  const STABLE_ROUNDS_LIMIT = 5;

  /* ─────────────────────────── utilidades base ─────────────────────────── */

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function sendResult(result) {
    const payload = Object.assign({ type: "PGS_CELL_RESULT" }, result);
    try {
      const p = chrome.runtime.sendMessage(payload);
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (_) {
      /* sw reiniciando — o resultado é re-pedido pelo loop via timeout */
    }
  }

  function startPing() {
    stopPing();
    pingTimer = setInterval(() => {
      try {
        const p = chrome.runtime.sendMessage({ type: "PGS_PING" });
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch (_) {
        /* extensão recarregada */
      }
    }, 20000);
  }
  function stopPing() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  /** Pede um delay humanizado ao sw (log-normal do modo atual). */
  async function askDelay(kind, textLen) {
    try {
      const res = await chrome.runtime.sendMessage({ type: "PGS_DELAY", kind: kind, textLen: textLen || 0 });
      if (res && typeof res.ms === "number" && res.ms >= 0) return res.ms;
    } catch (_) {
      /* fallback conservador se o sw estiver indisponível */
    }
    return kind === "idle" ? 4000 : 1500;
  }

  /* ─────────────────────── injeção do MAIN world ─────────────────────── */

  function injectMainWorldScript() {
    const existing = document.getElementById("pgs-injected-main");
    if (existing) return;
    const script = document.createElement("script");
    script.id = "pgs-injected-main";
    script.src = chrome.runtime.getURL("injected.js");
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
    script.addEventListener("load", () => script.remove());
  }

  // Payload do MAIN world → isolated world (validação de origem OBRIGATÓRIA).
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== "PGS_PAYLOAD") return;
    if (!data.data || !Array.isArray(data.data.places)) return;
    payloadPlaces = data.data.places;
  });

  function waitForPayload(timeoutMs) {
    if (payloadPlaces.length > 0) return Promise.resolve();
    const started = Date.now();
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (payloadPlaces.length > 0 || Date.now() - started > timeoutMs) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  }

  /* ─────────────────────── navegação / URL da célula ─────────────────────── */

  function buildSearchUrl(term, lat, lng) {
    return (
      "https://www.google.com/maps/search/" +
      encodeURIComponent(term) +
      "/@" +
      lat.toFixed(6) +
      "," +
      lng.toFixed(6) +
      ",15z"
    );
  }

  /** Interpreta a URL atual se for /maps/search/<termo>/@lat,lng,z. */
  function currentSearchInfo() {
    const match = location.pathname.match(/^\/maps\/search\/([^/]+)(?:\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?))?/);
    if (!match) return null;
    let term = null;
    const rawTerm = match[1].replace(/\+/g, " "); // o Maps reescreve %20 como "+"
    try {
      term = decodeURIComponent(rawTerm);
    } catch (_) {
      term = rawTerm;
    }
    return {
      term: term,
      lat: match[2] ? parseFloat(match[2]) : null,
      lng: match[3] ? parseFloat(match[3]) : null,
    };
  }

  function normTerm(value) {
    return String(value || "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function needsNavigation(term, cellCenter) {
    const cur = currentSearchInfo();
    if (!cur || normTerm(cur.term) !== normTerm(term)) return true;
    if (cur.lat === null || cur.lng === null) return true;
    return (
      Math.abs(cur.lat - cellCenter.lat) > 0.02 || Math.abs(cur.lng - cellCenter.lng) > 0.02
    );
  }

  /** Captcha / bloqueio de tráfego (ADR-002 D4). */
  function captchaOnPage() {
    if (/\/sorry\//.test(location.href)) return true;
    if (/\/google\/cancel\//.test(location.href)) return true;
    const title = document.title || "";
    return /unusual traffic|tráfego incomum|tráfego não usual|tráfico inusual/i.test(title);
  }

  /* ───────────────────────── extração DOM (fonte "dom") ───────────────────────── */

  function cardLinks() {
    const feed = document.querySelector('div[role="feed"]');
    const scope = feed || document;
    return Array.from(scope.querySelectorAll('a[href*="/maps/place/"]'));
  }

  /**
   * Card root: menor ancestral do link que também contém sinais de informação
   * (botões data-item-id ou span de rating). Sobe no máximo 8 níveis.
   */
  function findCardRoot(link) {
    let el = link;
    for (let i = 0; i < 8 && el && el.parentElement; i++) {
      el = el.parentElement;
      const hasInfo =
        el.querySelector('button[data-item-id]') ||
        el.querySelector('span[aria-label*="star" i]') ||
        el.querySelector('span[aria-label*="estrela" i]');
      if (hasInfo) return el;
    }
    return link.parentElement
      ? link.parentElement.parentElement
        ? link.parentElement.parentElement.parentElement || link.parentElement
        : link.parentElement
      : link;
  }

  function stripLabelPrefix(label) {
    if (!label) return null;
    return label
      .replace(/^(Telefone|Phone|Teléfono|Téléphone)\s*:\s*/i, "")
      .replace(/^(Endereço|Address|Dirección|Adresse)\s*:\s*/i, "")
      .trim() || null;
  }

  /** rating/reviews/categoria da "linha de avaliação" do card (aria-label + texto). */
  function parseRatingLine(card) {
    const el =
      card.querySelector('span[aria-label*="estrela" i]') ||
      card.querySelector('span[aria-label*="star" i]');
    if (!el) return { rating: null, reviews: null, category: null };
    const label = (el.getAttribute("aria-label") || "").replace(",", ".");
    const ratingMatch = label.match(/(\d+(?:\.\d+)?)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

    const line = el.parentElement ? el.parentElement.textContent || "" : "";
    let reviews = null;
    const paren = line.match(/\(([^)]+)\)/);
    if (paren) {
      const digits = paren[1].replace(/[.\s\u00a0]/g, "").replace(/,/g, "");
      const n = parseInt(digits, 10);
      if (isFinite(n) && n >= 0) reviews = n;
    }
    let category = null;
    const parts = line.split("·").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const cleaned = parts[parts.length - 1].replace(/\([^)]*\)/g, "").trim();
      if (cleaned && !/^\d+([.,]\d+)?$/.test(cleaned) && cleaned.length <= 120) category = cleaned;
    }
    return { rating: rating, reviews: reviews, category: category };
  }

  /**
   * place_id / CID / lat / lng a partir do href do card.
   * ChIJ* = place_id canônico; 0x…:0x… = ftid (usado como cid + fallback id);
   * !3dLAT!4dLNG = coordenadas do place.
   */
  function parsePlaceHref(href) {
    const out = { placeId: null, ftid: null, cid: null, lat: null, lng: null };
    try {
      const raw = decodeURIComponent(href);
      const chij = raw.match(/ChIJ[0-9A-Za-z_-]{10,}/);
      if (chij) out.placeId = chij[0];
      const ftid = raw.match(/(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
      if (ftid) {
        out.ftid = ftid[1];
        if (!out.cid) out.cid = ftid[1].split(":").pop();
      }
      const coords = raw.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
      if (coords) {
        out.lat = parseFloat(coords[1]);
        out.lng = parseFloat(coords[2]);
      }
    } catch (_) {
      /* href inválido — mantém nulos */
    }
    return out;
  }

  function stableIdFromHref(href, hrefInfo) {
    if (hrefInfo.placeId) return hrefInfo.placeId;
    if (hrefInfo.ftid) return "ftid_" + hrefInfo.ftid.replace(/[^0-9a-fA-F]/g, "");
    if (hrefInfo.cid) return "cid_" + hrefInfo.cid;
    // djb2 do href — último recurso, estável dentro da sessão
    let h = 5381;
    for (let i = 0; i < href.length; i++) h = ((h << 5) + h + href.charCodeAt(i)) >>> 0;
    return "href_" + h.toString(16);
  }

  /** Lista social duplicada do servidor (src/server/leads/classify.ts) — INFORMATIVO:
   *  o servidor recalcula website_type na ingestão; aqui é só telemetria. */
  const SOCIAL_HOSTS = [
    "facebook.com", "instagram.com", "linktr.ee", "wa.me", "whatsapp.com", "bio.link",
    "business.site", "negocio.site", "link.me", "tiktok.com", "youtube.com",
    "linkedin.com", "x.com", "twitter.com", "same.app", "wa.link",
  ];

  function websiteTypeOf(url) {
    if (!url) return "none";
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      const social = SOCIAL_HOSTS.some((s) => host === s || host.endsWith("." + s));
      return social ? "social" : "own";
    } catch (_) {
      return "none";
    }
  }

  /** E.164 básico — normalização de verdade é do servidor (libphonenumber-js). */
  function basicE164(rawPhone) {
    if (!rawPhone) return null;
    const plus = rawPhone.trim().startsWith("+");
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) return (plus ? "+" : "") + digits;
    return null;
  }

  /** Normaliza um card DOM → lead parcial (campos + origens). */
  function fromDomCard(card, link) {
    const href = link.href || link.getAttribute("href") || "";
    const hrefInfo = parsePlaceHref(href);
    const ratingInfo = parseRatingLine(card);
    const name =
      (link.getAttribute("aria-label") || "").trim() ||
      (link.textContent || "").split("\n")[0].trim() ||
      null;

    const phoneBtn = card.querySelector('button[data-item-id*="phone"]');
    const addrBtn = card.querySelector('button[data-item-id*="addr"]');
    const siteA = card.querySelector('a[data-value="Website"]');

    const fields = {};
    const sources = { payload: [], dom: [] };
    const mark = (field, value) => {
      if (value !== null && value !== undefined && value !== "") {
        fields[field] = value;
        sources.dom.push(field);
      }
    };

    mark("name", name);
    mark("rating", ratingInfo.rating);
    mark("reviews_count", ratingInfo.reviews);
    mark("category", ratingInfo.category);
    mark("address", stripLabelPrefix(addrBtn ? addrBtn.getAttribute("aria-label") : null));
    const phone = stripLabelPrefix(phoneBtn ? phoneBtn.getAttribute("aria-label") : null);
    mark("phone_raw", phone);
    mark("phone_e164", basicE164(phone));
    const website = siteA ? siteA.href : null;
    mark("website", website);
    mark("website_type", website ? websiteTypeOf(website) : null);
    mark("lat", hrefInfo.lat);
    mark("lng", hrefInfo.lng);

    return {
      place_id: stableIdFromHref(href, hrefInfo),
      cid: hrefInfo.cid,
      categories: ratingInfo.category ? [ratingInfo.category] : [],
      fields: fields,
      sources: sources,
    };
  }

  /** Payload place → lead parcial com origens "payload". */
  function fromPayloadPlace(p) {
    const fields = {};
    const sources = { payload: [], dom: [] };
    const mark = (field, value) => {
      if (value !== null && value !== undefined && value !== "") {
        fields[field] = value;
        sources.payload.push(field);
      }
    };
    mark("name", p.name);
    mark("phone_raw", p.phone);
    mark("phone_e164", basicE164(p.phone));
    mark("website", p.website);
    if (p.website) mark("website_type", websiteTypeOf(p.website));
    mark("rating", p.rating);
    mark("reviews_count", p.reviews_count);
    mark("address", p.address);
    mark("lat", p.lat);
    mark("lng", p.lng);
    mark("plus_code", p.plus_code);
    mark("price_level", p.price_level);
    mark("photos_count", p.photos_count);
    if (p.claimed !== null && p.claimed !== undefined) {
      fields.claimed = Boolean(p.claimed);
      sources.payload.push("claimed");
    }
    const categories = Array.isArray(p.categories) ? p.categories.slice(0, 20) : [];
    if (categories.length > 0) {
      fields.categories = categories;
      fields.category = categories[0];
      sources.payload.push("categories");
    }
    return { place_id: p.place_id, cid: p.cid, fields: fields, sources: sources };
  }

  /* ─────────────────────── merge + pós-filtro bbox ─────────────────────── */

  const MERGEABLE_FIELDS = [
    "name", "phone_raw", "phone_e164", "website", "website_type", "rating",
    "reviews_count", "address", "lat", "lng", "plus_code", "price_level",
    "photos_count", "claimed", "category", "categories",
  ];

  function inBbox(lat, lng, cell) {
    const eps = 1e-6;
    return (
      lat >= cell.latMin - eps && lat <= cell.latMax + eps &&
      lng >= cell.lngMin - eps && lng <= cell.lngMax + eps
    );
  }

  /**
   * Merge payload (prioridade) + DOM por place_id; depois PÓS-FILTRO por bbox:
   * leads com coords fora da célula são DESCARTADOS; leads sem coords ficam
   * (lat/lng null — o servidor aceita nullable; flag de telemetria no log).
   */
  function mergeAndFilter(payloadList, domList, cell) {
    const byId = new Map();
    const order = [];
    const unknownCoords = { count: 0 };
    let dropped = 0;

    const put = (entry) => {
      if (!entry || !entry.place_id) return;
      let lead = byId.get(entry.place_id);
      if (!lead) {
        lead = { place_id: entry.place_id, cid: null, fields: {}, sources: { payload: [], dom: [] } };
        byId.set(entry.place_id, lead);
        order.push(entry.place_id);
      }
      if (entry.cid && !lead.cid) lead.cid = entry.cid;
      // merge "preenche vazio": quem veio antes tem prioridade (payload primeiro)
      for (const field of MERGEABLE_FIELDS) {
        if (lead.fields[field] === undefined && entry.fields[field] !== undefined) {
          lead.fields[field] = entry.fields[field];
        }
      }
      for (const f of entry.sources.payload) if (lead.sources.payload.indexOf(f) === -1) lead.sources.payload.push(f);
      for (const f of entry.sources.dom) if (lead.sources.dom.indexOf(f) === -1) lead.sources.dom.push(f);
    };

    for (const p of payloadList) put(fromPayloadPlace(p));
    for (const card of domList) put(card);

    const leads = [];
    for (const id of order) {
      const lead = byId.get(id);
      const lat = lead.fields.lat;
      const lng = lead.fields.lng;
      if (typeof lat === "number" && typeof lng === "number") {
        if (!inBbox(lat, lng, cell)) {
          dropped += 1;
          continue; // vazamento da célula — descarta (lição gosom)
        }
      } else {
        unknownCoords.count += 1; // sem coords → mantém (servidor aceita null)
      }
      if (!lead.fields.name || String(lead.fields.name).trim().length === 0) continue;
      leads.push(lead);
    }
    return { leads: leads, unknownCoords: unknownCoords.count, dropped: dropped };
  }

  /* ─────────────────────────── scroll humanizado ─────────────────────────── */

  function feedEndReached(feed) {
    const text = (feed && feed.innerText) || "";
    if (/you['’]?ve reached the end/i.test(text)) return true;
    if (/chegou ao fim/i.test(text)) return true;
    if (/fim da lista|end of results|no more results/i.test(text)) return true;
    return false;
  }

  function smoothScroll(feed) {
    return new Promise((resolve) => {
      try {
        const start = feed.scrollTop;
        const distance = Math.max(350, Math.min(feed.clientHeight * 1.6, 1200));
        const target = Math.min(start + distance, Math.max(feed.scrollHeight - feed.clientHeight, start));
        const duration = 550 + Math.random() * 450;
        const t0 = performance.now();
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
        function frame(now) {
          const t = Math.min((now - t0) / duration, 1);
          feed.scrollTop = start + (target - start) * easeOutCubic(t);
          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        }
        requestAnimationFrame(frame);
      } catch (_) {
        resolve();
      }
    });
  }

  /** Micro-pausa de leitura proporcional ao texto dos nomes visíveis (ADR-002 D3). */
  function visibleNameChars() {
    const links = document.querySelectorAll('a[href*="/maps/place/"][aria-label]');
    const max = Math.min(links.length, 12);
    let total = 0;
    for (let i = 0; i < max; i++) total += (links[i].getAttribute("aria-label") || "").length;
    return total;
  }

  async function scrollFeed(feed) {
    let stableRounds = 0;
    let lastCount = cardLinks().length;
    let endReached = false;
    let steps = 0;
    while (steps < MAX_SCROLL_STEPS) {
      if (feedEndReached(feed)) {
        endReached = true;
        break;
      }
      const before = cardLinks().length;
      await smoothScroll(feed);
      await sleep(await askDelay("scroll"));
      await sleep(await askDelay("read", visibleNameChars()));
      if (Math.random() < 0.15) await sleep(await askDelay("idle"));
      // re-parseia o payload do MAIN world (APP_INITIALIZATION_STATE pode atualizar)
      try {
        window.postMessage({ type: "PGS_COLLECT" }, window.location.origin);
      } catch (_) {
        window.postMessage({ type: "PGS_COLLECT" }, "*");
      }
      const after = cardLinks().length;
      if (after === before && after === lastCount) {
        stableRounds += 1;
        if (stableRounds >= STABLE_ROUNDS_LIMIT) break;
      } else {
        stableRounds = 0;
      }
      lastCount = after;
      steps += 1;
    }
    return endReached;
  }

  /* ─────────────────────────── espera do feed ─────────────────────────── */

  async function waitForFeed(timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (captchaOnPage()) return "captcha";
      if (document.querySelector('div[role="feed"]')) return "feed";
      if (document.querySelector('a[href*="/maps/place/"]')) return "feed";
      await sleep(300);
    }
    return "timeout";
  }

  /* ─────────────────────── tarefa principal de célula ─────────────────────── */

  /**
   * @param {{extId:string, latMin:number, lngMin:number, latMax:number, lngMax:number, depth:number}} cell
   * @param {string} term
   * @param {string} speedMode
   * @param {number} reloadAttempt
   * @returns {Promise<object|null>} resultado da célula ou null se navegou
   */
  async function scrapeTask(cell, term, speedMode, reloadAttempt, alreadyNavigated) {
    workingCellExtId = cell.extId;
    const center = {
      lat: (cell.latMin + cell.latMax) / 2,
      lng: (cell.lngMin + cell.lngMax) / 2,
    };

    if (captchaOnPage()) {
      return {
        cellExtId: cell.extId,
        leads: [],
        resultCount: 0,
        strategyCounts: { payload: 0, dom: 0, detail: 0 },
        captchaDetected: true,
        endReached: false,
        lastError: "captcha_suspeito",
      };
    }

    // (a) navegação — a aba do Maps é controlada por nós
    if (!alreadyNavigated && needsNavigation(term, center)) {
      await savePending(cell, term, speedMode, reloadAttempt, true);
      location.href = buildSearchUrl(term, center.lat, center.lng);
      return null; // instância morre; a nova retoma via PGS_GET_PENDING
    }

    // (a.2) URL correta mas feed nunca veio → um reload de cortesia
    const feedState = await waitForFeed(FEED_WAIT_MS);
    if (feedState === "captcha") {
      return {
        cellExtId: cell.extId,
        leads: [],
        resultCount: 0,
        strategyCounts: { payload: 0, dom: 0, detail: 0 },
        captchaDetected: true,
        endReached: false,
        lastError: "captcha_no_load",
      };
    }
    if (feedState === "timeout" && reloadAttempt < 1) {
      await savePending(cell, term, speedMode, reloadAttempt + 1, true);
      location.reload();
      return null;
    }
    if (feedState === "timeout") {
      return {
        cellExtId: cell.extId,
        leads: [],
        resultCount: 0,
        strategyCounts: { payload: 0, dom: 0, detail: 0 },
        captchaDetected: false,
        endReached: false,
        lastError: "feed_timeout",
      };
    }

    // (b) payload do MAIN world
    injectMainWorldScript();
    try {
      window.postMessage({ type: "PGS_COLLECT" }, window.location.origin);
    } catch (_) {
      window.postMessage({ type: "PGS_COLLECT" }, "*");
    }
    await waitForPayload(4000);

    // (e) rolagem humana do feed
    const feed = document.querySelector('div[role="feed"]');
    let endReached = false;
    if (feed) {
      endReached = await scrollFeed(feed);
    }

    // (c) coleta DOM + merge + (d) pós-filtro bbox + (f) dedup por place_id
    const feedEl = document.querySelector('div[role="feed"]');
    const links = cardLinks();
    const seen = new Set();
    const domEntries = [];
    for (const link of links) {
      const card = findCardRoot(link);
      const entry = fromDomCard(card, link);
      if (seen.has(entry.place_id)) continue;
      seen.add(entry.place_id);
      domEntries.push(entry);
    }

    const merged = mergeAndFilter(payloadPlaces, domEntries, cell);

    // contagem de estratégias: lead conta para a fonte que trouxe o NOME
    const strategyCounts = { payload: 0, dom: 0, detail: 0 };
    const leadsOut = [];
    for (const lead of merged.leads) {
      if (lead.sources.payload.indexOf("name") !== -1) strategyCounts.payload += 1;
      else if (lead.sources.dom.indexOf("name") !== -1) strategyCounts.dom += 1;
      leadsOut.push({
        place_id: lead.place_id,
        cid: lead.cid || null,
        name: String(lead.fields.name || "").trim(),
        phone_e164: lead.fields.phone_e164 || null,
        phone_raw: lead.fields.phone_raw || null,
        website: lead.fields.website || null,
        website_type: lead.fields.website_type || "none",
        email: null,
        address: lead.fields.address || null,
        lat: typeof lead.fields.lat === "number" ? lead.fields.lat : null,
        lng: typeof lead.fields.lng === "number" ? lead.fields.lng : null,
        plus_code: lead.fields.plus_code || null,
        category: lead.fields.category || null,
        categories: Array.isArray(lead.fields.categories) ? lead.fields.categories : [],
        rating: typeof lead.fields.rating === "number" ? lead.fields.rating : null,
        reviews_count: typeof lead.fields.reviews_count === "number" ? lead.fields.reviews_count : null,
        price_level: typeof lead.fields.price_level === "number" ? lead.fields.price_level : null,
        photos_count: typeof lead.fields.photos_count === "number" ? lead.fields.photos_count : null,
        claimed: typeof lead.fields.claimed === "boolean" ? lead.fields.claimed : null,
        sources: lead.sources,
      });
    }

    if (captchaOnPage()) {
      return {
        cellExtId: cell.extId,
        leads: [],
        resultCount: 0,
        strategyCounts: strategyCounts,
        captchaDetected: true,
        endReached: endReached,
        lastError: "captcha_apos_scroll",
      };
    }

    if (leadsOut.length === 0 && merged.dropped > 0) {
      return {
        cellExtId: cell.extId,
        leads: [],
        resultCount: 0,
        strategyCounts: strategyCounts,
        captchaDetected: false,
        endReached: endReached,
        lastError:
          "fora_da_regiao: " + merged.dropped + " resultados do Google estão fora da área escolhida (centro " +
          center.lat.toFixed(4) + ", " + center.lng.toFixed(4) + ").",
      };
    }

    if (merged.unknownCoords > 0 && feedEl) {
      // telemetria — logs ficam no sw (console do sw é o que importa em MV3)
      console.info("[PGS] leads sem coords mantidos:", merged.unknownCoords);
    }

    return {
      cellExtId: cell.extId,
      leads: leadsOut,
      resultCount: leadsOut.length,
      strategyCounts: strategyCounts,
      captchaDetected: false,
      endReached: endReached,
      lastError: null,
    };
  }

  /* ─────────────────────── pendência / retomada (crash-safe) ─────────────────────── */

  async function savePending(cell, term, speedMode, reloadAttempt, navigated) {
    try {
      const p = chrome.runtime.sendMessage({
        type: "PGS_SAVE_PENDING",
        pending: { cell: cell, term: term, speedMode: speedMode, reloadAttempt: reloadAttempt || 0, navigated: Boolean(navigated) },
      });
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (_) {
      /* sw indisponível — o loop dele detectará timeout e reenviará o comando */
    }
  }

  /** Nova instância (pós-navegação) retoma a célula pendente. */
  async function resumePendingIfAny() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "PGS_GET_PENDING" });
      if (!res || !res.ok || !res.pending) return;
      const pending = res.pending;
      if (!pending.cell || !pending.term) return;
      startPing();
      const result = await scrapeTask(
        pending.cell,
        pending.term,
        pending.speedMode || "moderate",
        pending.reloadAttempt || 0,
        Boolean(pending.navigated)
      );
      stopPing();
      workingCellExtId = null;
      if (result) sendResult(result);
    } catch (_) {
      /* sem pendência ou sw indisponível */
    }
  }

  /* ─────────────────────────────── roteamento ─────────────────────────────── */

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg.type !== "string") return false;

    if (msg.type === "PGS_PING") {
      // respondido pelo sw; aqui só por robustez se o sw falhar
      sendResponse({ ok: true, pong: true });
      return false;
    }

    if (msg.type === "PGS_SCRAPE_CELL") {
      const cell = msg.cell;
      const term = msg.term;
      const speedMode = msg.speedMode || "moderate";
      if (!cell || !cell.extId || !term) {
        sendResponse({ ok: false, error: "scrape_cell_invalido" });
        return false;
      }
      if (workingCellExtId === cell.extId) {
        sendResponse({ ok: true, accepted: true, duplicate: true });
        return false;
      }
      workingCellExtId = cell.extId;
      sendResponse({ ok: true, accepted: true });

      (async () => {
        startPing();
        let result = null;
        try {
          result = await scrapeTask(cell, term, speedMode, 0);
        } catch (err) {
          result = {
            cellExtId: cell.extId,
            leads: [],
            resultCount: 0,
            strategyCounts: { payload: 0, dom: 0, detail: 0 },
            captchaDetected: false,
            endReached: false,
            lastError: String((err && err.message) || err).slice(0, 300),
          };
        }
        stopPing();
        workingCellExtId = null;
        if (result) sendResult(result);
        // result === null → a instância navegou/recarregou; a nova retoma
      })();
      return false;
    }

    return false;
  });

  // Retomada automática após navegação/recarga iniciada por PGS_SCRAPE_CELL
  resumePendingIfAny();
})();
