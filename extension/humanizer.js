/**
 * humanizer.js — perfis de delay e distribuição log-normal (ADR-002, D3).
 * PERFIS EXATOS da spec (ms):
 *   stealth  {min:2800, max:6500}  ~250 leads/h
 *   moderate {min:1200, max:3000}  ~700 leads/h
 *   fast     {min:500,  max:1400}  ~1800 leads/h
 *   turbo    {min:150,  max:500}   ~4000 leads/h
 *
 * Distribuição LOG-NORMAL (nunca uniforme): Box-Muller sobre ln.
 *   μ = (ln(min)+ln(max))/2 (média geométrica)
 *   σ = (ln(max)-ln(min))/(2·1.645) — ~90% da massa dentro de [min,max],
 *       com clamp final para garantir o envelope do perfil.
 *
 * Determinismo: mulberry32 com seed opcional (mesma seed → mesma sequência),
 * usado pelo sw para replay/testes.
 */
/* global PGS */

(function () {
  "use strict";

  /** Perfis por modo — FONTE ÚNICA DE VERDADE (o content script pede delays ao sw). */
  const PROFILES = {
    stealth: { min: 2800, max: 6500, perHour: 250 },
    moderate: { min: 1200, max: 3000, perHour: 700 },
    fast: { min: 500, max: 1400, perHour: 1800 },
    turbo: { min: 150, max: 500, perHour: 4000 },
  };

  /** Ordem turbo → fast → moderate → stealth (circuit breaker desce um nível). */
  const DOWNGRADE_ORDER = ["stealth", "moderate", "fast", "turbo"]; // índice 0 = mais lento

  /**
   * PRNG mulberry32 — determinístico por seed.
   * @param {number} seed
   * @returns {() => number} próximo número em [0,1)
   */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Hash simples de string → seed 32 bits (para derivar seed do searchExtId). */
  function seedFromString(s) {
    let h = 1779033703 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  /**
   * Delay log-normal entre [min,max] do perfil.
   * @param {{min:number,max:number}} profile
   * @param {() => number} [rng] gerador [0,1) — padrão Math.random
   * @returns {number} ms (inteiro)
   */
  function delayLogNormal(profile, rng) {
    const rand = typeof rng === "function" ? rng : Math.random;
    const lnMin = Math.log(Math.max(profile.min, 1));
    const lnMax = Math.log(Math.max(profile.max, lnMin + 0.001));
    const mu = (lnMin + lnMax) / 2;
    const sigma = (lnMax - lnMin) / (2 * 1.645);
    // Box-Muller: dois uniformes → normal padrão z
    const u1 = Math.max(rand(), 1e-9); // evita ln(0)
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const ms = Math.exp(mu + sigma * z);
    return Math.round(Math.min(Math.max(ms, profile.min), profile.max));
  }

  /** sleep em ms — usado pelo loop do sw. */
  function sleepMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)));
  }

  /** Estimativa de leads/hora por modo (mostrada na Side Panel). */
  function estimatePerHour(mode) {
    const p = PROFILES[mode];
    return p ? p.perHour : PROFILES.moderate.perHour;
  }

  /** Média de delay do modo (s) — usada na ETA da Side Panel. */
  function averageDelaySec(mode) {
    const p = PROFILES[mode] || PROFILES.moderate;
    return (p.min + p.max) / 2 / 1000;
  }

  /**
   * Desce um nível de velocidade (turbo → fast → moderate → stealth).
   * @param {string} mode
   * @returns {string} novo modo (nunca sobe)
   */
  function downgradeSpeed(mode) {
    const idx = DOWNGRADE_ORDER.indexOf(mode);
    if (idx === -1) return "stealth";
    // DOWNGRADE_ORDER[0]=stealth … [3]=turbo → descer = aproximar de stealth (índice menor)
    return DOWNGRADE_ORDER[Math.max(idx - 1, 0)];
  }

  /**
   * Cria um "delay engine" com rng semeado — o sw mantém uma instância por busca
   * para comportamento reprodutível dentro da mesma sessão de varredura.
   * @param {string} mode
   * @param {string} seedString
   */
  function createEngine(mode, seedString) {
    const rng = mulberry32(seedFromString(seedString || "pgs"));
    return {
      profile: () => PROFILES[mode] || PROFILES.moderate,
      nextDelay: () => delayLogNormal(PROFILES[mode] || PROFILES.moderate, rng),
      /**
       * Delay para o content script.
       * kind: "scroll" | "read" | "idle" — leitura escala com o texto visível.
       * @param {{kind?: string, textLen?: number}} [req]
       */
      nextFor: (req) => {
        const base = delayLogNormal(PROFILES[mode] || PROFILES.moderate, rng);
        const kind = req && req.kind ? req.kind : "scroll";
        if (kind === "read") {
          const textLen = Math.min(Math.max((req && req.textLen) || 0, 0), 400);
          const factor = 1 + textLen / 300; // micro-pausa proporcional ao texto (ADR-002 D3)
          return Math.round(Math.min(base * factor, base * 2));
        }
        if (kind === "idle") {
          return Math.round(base * (1.5 + rng() * 2)); // idle aleatório mais longo
        }
        return base;
      },
    };
  }

  PGS.humanizer = {
    PROFILES,
    DOWNGRADE_ORDER,
    mulberry32,
    seedFromString,
    delayLogNormal,
    sleepMs,
    estimatePerHour,
    averageDelaySec,
    downgradeSpeed,
    createEngine,
  };
})();
