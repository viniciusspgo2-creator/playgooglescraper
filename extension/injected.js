/**
 * injected.js — roda no MAIN world da página do Google Maps (ADR-002, D1).
 *
 * Lê window.APP_INITIALIZATION_STATE (e variantes), parseia as respostas JSON
 * embutidas (strings com prefixo )]}') e extrai leads com VALIDAÇÃO POR CAMPO.
 * Nunca confiamos em um único índice fixo (issue gosom: [3]["Tf"][6] muda entre
 * versões) — cada campo tenta uma LISTA de caminhos candidatos e é validado por
 * tipo/intervalo antes de ser aceito.
 *
 * Comunicação: postMessage {type:"PGS_PAYLOAD", data:{places, source:"payload"}}
 * — o content script valida event.source === window antes de aceitar.
 * Re-injeção é segura (guard __PGS_INJECTED_MAIN__ + coleta idempotente).
 */
(function () {
  "use strict";
  if (window.__PGS_INJECTED_MAIN__) return;
  window.__PGS_INJECTED_MAIN__ = true;

  /* ────────────────────────────── utilidades ────────────────────────────── */

  function isStr(v, min, max) {
    return typeof v === "string" && v.length >= (min || 1) && v.length <= (max || 256);
  }
  function isNum(v, min, max) {
    return typeof v === "number" && isFinite(v) && v >= min && v <= max;
  }
  function isObj(v) {
    return v !== null && typeof v === "object";
  }

  /**
   * Percorre caminho por caminho na estrutura (aceita índices numéricos).
   * @param {unknown} root
   * @param {Array<Array<number|string>>} paths
   * @param {(v: unknown) => boolean} validate
   * @returns {unknown} primeiro valor validado ou null
   */
  function pick(root, paths, validate) {
    for (const path of paths) {
      try {
        let cur = root;
        for (const key of path) {
          if (!isObj(cur)) { cur = undefined; break; }
          cur = cur[key];
        }
        if (validate(cur)) return cur;
      } catch (_) {
        /* caminho inválido nesta versão do payload — tenta o próximo */
      }
    }
    return null;
  }

  /* ─────────────────── leitura das respostas embutidas ─────────────────── */

  const JSON_PREFIX = /^\)\]\}'\s*/;

  function tryParseEmbedded(s) {
    if (!isStr(s, 8, 20 * 1024 * 1024)) return null;
    if (!JSON_PREFIX.test(s)) return null;
    try {
      return JSON.parse(s.replace(JSON_PREFIX, ""));
    } catch (_) {
      return null;
    }
  }

  /** Varre recursivamente (profundidade ≤ 14) coletando objetos e strings. */
  function walkDeep(root, visit, depth) {
    const d = depth || 0;
    if (d > 14 || !isObj(root)) return;
    visit(root);
    if (Array.isArray(root)) {
      for (const item of root) walkDeep(item, visit, d + 1);
    } else {
      for (const value of Object.values(root)) walkDeep(value, visit, d + 1);
    }
  }

  /**
   * Raízes candidatas: APP_INITIALIZATION_STATE e qualquer global
   * APP_INITIALIZATION*; dentro delas, tudo que parsear como JSON embutido.
   * @returns {Array<object>} estruturas candidatas
   */
  function candidateRoots() {
    const roots = [];
    for (const key of Object.keys(window)) {
      if (key.indexOf("APP_INITIALIZATION") !== 0) continue;
      const value = window[key];
      if (isObj(value)) {
        roots.push(value);
        walkDeep(value, (node) => {
          if (typeof node === "string") {
            const parsed = tryParseEmbedded(node);
            if (isObj(parsed)) roots.push(parsed);
          }
        });
      }
    }
    return roots;
  }

  /* ─────────────────── identificação de listas de places ─────────────────── */

  /**
   * Lista de places candidata: array com ≥3 linhas, cada linha array com
   * ≥20 elementos (largura típica do payload do Maps). Validação estrutural,
   * NÃO por índice fixo de bloco.
   */
  function looksLikePlaceList(node) {
    return (
      Array.isArray(node) &&
      node.length >= 3 &&
      node.every((row) => Array.isArray(row) && row.length >= 20)
    );
  }

  function collectPlaceLists(root, out) {
    walkDeep(root, (node) => {
      if (looksLikePlaceList(node) && out.indexOf(node) === -1) out.push(node);
    });
  }

  /* ────────────────────── extração e validação por campo ────────────────────── */

  const CHIJ_RE = /^ChIJ[0-9A-Za-z_-]{10,}$/;
  const FTID_RE = /^0x[0-9a-fA-F]+:0x[0-9a-fA-F]+$/;
  const HAS_DIGIT_RE = /\d/;

  function extractPlace(row) {
    // Acessos curtos — row[14] é o bloco de detalhe na maioria das versões.
    const d14 = isObj(row[14]) ? row[14] : null;

    const name =
      pick(row, [[14, 11], [11]], (v) => isStr(v, 1, 256) && v.trim().length > 0) || null;

    const phone =
      pick(row, [[14, 178, 0, 0], [178, 0, 0], [14, 53]], (v) => isStr(v, 5, 32) && HAS_DIGIT_RE.test(v)) ||
      null;

    const website =
      pick(row, [[14, 7, 0], [7, 0]], (v) => isStr(v, 4, 512) && v.indexOf(".") !== -1) || null;

    const rating = pick(row, [[14, 4, 7], [4, 7]], (v) => isNum(v, 0, 5)) || null;
    const reviews = pick(row, [[14, 4, 8], [4, 8]], (v) => isNum(v, 0, 10000000)) || null;

    let placeId =
      pick(row, [[14, 10], [10]], (v) => isStr(v, 10, 512) && (CHIJ_RE.test(v) || FTID_RE.test(v))) ||
      pick(row, [[14, 10], [10]], (v) => isStr(v, 10, 512)) ||
      null;

    const cidRaw = pick(row, [[10], [14, 10]], (v) => isStr(v, 10, 128) && FTID_RE.test(v));
    const cid = cidRaw ? cidRaw.split(":").pop() : null;

    /**
     * lat/lng: heurística de projeção (spec §payload). Candidatos [14][9] e [9];
     * pode vir [lat,lng], [[lat,lng]] ou inteiros escalados (~1e7). Se nada
     * plausível → null (o sw mantém o lead com coords desconhecidas; o
     * pós-filtro por bbox só descarta quando há coords).
     */
    function plausibleLatLng(arr) {
      if (!Array.isArray(arr) || arr.length < 2) return null;
      let a = arr[0];
      let b = arr[1];
      if (Array.isArray(a) && a.length >= 2) { b = a[1]; a = a[0]; }
      if (typeof a !== "number" || typeof b !== "number" || !isFinite(a) || !isFinite(b)) return null;
      // Escala inteira comum (~E7): 374220000 → 37.422
      if (Math.abs(a) > 90 && Math.abs(a) <= 9e8) a = a / 1e7;
      if (Math.abs(b) > 180 && Math.abs(b) <= 1.8e9) b = b / 1e7;
      if (!isNum(a, -90, 90) || !isNum(b, -180, 180)) return null;
      return [a, b];
    }
    const coordRaw = pick(row, [[14, 9], [9]], plausibleLatLng) || pick(row, [[14, 2, 0], [13, 2]], plausibleLatLng);
    const coord = coordRaw ? plausibleLatLng(coordRaw) : null;

    const categories =
      pick(row, [[14, 13], [13]], (v) =>
        Array.isArray(v) && v.length > 0 && v.length <= 20 && v.every((c) => isStr(c, 1, 128))
      ) || null;

    const address =
      pick(row, [[14, 2], [2]], (v) => isStr(v, 4, 512) && v.indexOf(",") !== -1) || null;

    const plusCode = pick(row, [[14, 183, 0], [183, 0]], (v) => isStr(v, 4, 64)) || null;

    // claimed: heurística conservadora — presença do campo 29 com valor truthy.
    const claimedRaw = pick(row, [[14, 29], [29]], (v) => v !== null && v !== undefined);
    const claimed = claimedRaw === null ? null : Boolean(claimedRaw);

    const priceLevel = pick(row, [[14, 4, 2], [4, 2]], (v) => isNum(v, 0, 4)) || null;
    const photosCount = pick(row, [[14, 146, 4, 0, 0], [146, 4, 0, 0]], (v) => isNum(v, 0, 100000)) || null;
    const hours = pick(row, [[14, 34], [34]], (v) => isObj(v)) || null;

    if (!name && !placeId) return null; // linha não é um place utilizável
    if (!placeId && name) placeId = null; // sem ID estável não deduplica — linha descartada

    return {
      name,
      phone,
      website,
      rating,
      reviews_count: reviews === null ? null : Math.round(reviews),
      place_id: placeId,
      cid,
      lat: coord ? coord[0] : null,
      lng: coord ? coord[1] : null,
      categories: categories || null,
      address,
      plus_code: plusCode,
      claimed,
      price_level: priceLevel === null ? null : Math.round(priceLevel),
      photos_count: photosCount === null ? null : Math.round(photosCount),
      hours,
    };
  }

  /* ────────────────────────────── coleta principal ────────────────────────────── */

  function collect() {
    const lists = [];
    for (const root of candidateRoots()) collectPlaceLists(root, lists);

    const byId = new Map();
    for (const list of lists) {
      for (const row of list) {
        const place = extractPlace(row);
        if (!place || !place.place_id) continue;
        const existing = byId.get(place.place_id);
        if (!existing) {
          byId.set(place.place_id, place);
        } else {
          // merge "preenche vazio" entre duplicatas do mesmo place
          for (const key of Object.keys(place)) {
            if (existing[key] === null || existing[key] === undefined) existing[key] = place[key];
          }
        }
      }
    }

    const places = Array.from(byId.values());
    try {
      window.postMessage({ type: "PGS_PAYLOAD", data: { places, source: "payload" } }, window.location.origin);
    } catch (_) {
      window.postMessage({ type: "PGS_PAYLOAD", data: { places, source: "payload" } }, "*");
    }
    return places.length;
  }

  /* Re-coleta sob demanda: o content script posta {type:"PGS_COLLECT"} após
   * scroll para capturar atualizações do APP_INITIALIZATION_STATE. */
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data && event.data.type === "PGS_COLLECT") collect();
  });

  collect(); // primeira passagem na injeção (idempotente por guard global)
})();
