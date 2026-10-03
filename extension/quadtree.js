/**
 * quadtree.js — funções puras da subdivisão Quadtree (ADR-002, D2).
 * Carregado no service worker via importScripts. Sem dependências externas.
 *
 * Regra de ouro (lição gosom): resultados do Google Maps NÃO são recortados à
 * célula — o pós-filtro por lat/lng dentro do bbox é OBRIGATÓRIO e vive no
 * content script; aqui só geramos a geometria.
 */
/* global PGS */

(function () {
  "use strict";

  const PGS_QUADTREE_SATURATE_THRESHOLD = 100; // ≥100 resultados → subdividir
  const PGS_EARTH_DEG_KM = 111.32; // km por grau de latitude (aprox. esférica)

  /**
   * Cria a célula raiz a partir de centro + raio (km).
   * dLat = raio/111.32; dLng = raio/(111.32·cos(lat)).
   * @param {number} centerLat
   * @param {number} centerLng
   * @param {number} radiusKm
   * @param {(prefix: string) => string} [makeId] fábrica de extId (injetada p/ testes)
   * @returns {PGS.QuadCell}
   */
  function makeRoot(centerLat, centerLng, radiusKm, makeId) {
    const dLat = radiusKm / PGS_EARTH_DEG_KM;
    const cosLat = Math.max(Math.cos((centerLat * Math.PI) / 180), 0.00001);
    const dLng = radiusKm / (PGS_EARTH_DEG_KM * cosLat);
    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
    return {
      extId: makeId ? makeId("root") : PGS.uuid(),
      depth: 0,
      latMin: clamp(centerLat - dLat, -90, 90),
      lngMin: clamp(centerLng - dLng, -180, 180),
      latMax: clamp(centerLat + dLat, -90, 90),
      lngMax: clamp(centerLng + dLng, -180, 180),
      status: "pending",
      found: 0,
      attempts: 0,
      lastError: null,
      serverId: null,
    };
  }

  /**
   * Subdivide a célula em 4 filhas (quadtree clássica: NW, NE, SW, SE).
   * A célula pai NÃO é descartada — fica "saturated" para telemetria/retomada.
   * @param {PGS.QuadCell} cell
   * @param {(i: number) => string} [makeId]
   * @returns {PGS.QuadCell[]}
   */
  function subdivide(cell, makeId) {
    const latMid = (cell.latMin + cell.latMax) / 2;
    const lngMid = (cell.lngMin + cell.lngMax) / 2;
    const quarters = [
      { latMin: latMid, latMax: cell.latMax, lngMin: cell.lngMin, lngMax: lngMid }, // NW
      { latMin: latMid, latMax: cell.latMax, lngMin: lngMid, lngMax: cell.lngMax }, // NE
      { latMin: cell.latMin, latMax: latMid, lngMin: cell.lngMin, lngMax: lngMid }, // SW
      { latMin: cell.latMin, latMax: latMid, lngMin: lngMid, lngMax: cell.lngMax }, // SE
    ];
    return quarters.map((q, i) => ({
      extId: makeId ? makeId(String(i)) : PGS.uuid(),
      depth: cell.depth + 1,
      latMin: q.latMin,
      lngMin: q.lngMin,
      latMax: q.latMax,
      lngMax: q.lngMax,
      status: "pending",
      found: 0,
      attempts: 0,
      lastError: null,
      serverId: null,
    }));
  }

  /** Centro geográfico da célula (usado na URL /maps/search/@lat,lng,z). */
  function cellCenter(cell) {
    return {
      lat: (cell.latMin + cell.latMax) / 2,
      lng: (cell.lngMin + cell.lngMax) / 2,
    };
  }

  /**
   * Progresso = células finalizadas (saturated|exhausted|failed) / total criadas.
   * Células "saturated" contam como concluídas: o trabalho delas virou 4 filhas.
   * @param {{cells: Record<string, PGS.QuadCell>}} stateLike
   * @returns {{done: number, total: number, ratio: number}}
   */
  function progress(stateLike) {
    const cells = Object.values(stateLike.cells || {});
    const done = cells.filter(
      (c) => c.status === "saturated" || c.status === "exhausted" || c.status === "failed"
    ).length;
    const total = cells.length;
    return { done, total, ratio: total > 0 ? done / total : 0 };
  }

  /** Contagem por status — telemetria do painel. */
  function countByStatus(stateLike) {
    const out = { pending: 0, running: 0, saturated: 0, exhausted: 0, failed: 0 };
    for (const c of Object.values(stateLike.cells || {})) {
      if (out[c.status] !== undefined) out[c.status] += 1;
    }
    return out;
  }

  PGS.quadtree = {
    SATURATE_THRESHOLD: PGS_QUADTREE_SATURATE_THRESHOLD,
    makeRoot,
    subdivide,
    cellCenter,
    progress,
    countByStatus,
  };
})();
