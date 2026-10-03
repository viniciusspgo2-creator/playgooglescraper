/**
 * sidepanel.js — UI da Side Panel (vanilla, sem build).
 * Comunica-se com o service worker por chrome.runtime.sendMessage (hub único)
 * e escuta PGS_EVENT para atualização em tempo real, com polling de fallback.
 * i18n: chrome.i18n.getMessage com fallback pt-BR (locales em _locales/*).
 */
(function () {
  "use strict";

  /* ─────────────────────────────── helpers ─────────────────────────────── */

  const $ = (id) => document.getElementById(id);

  const FALLBACK = {
    connect: "Conectar",
    tokenLabel: "Token de API",
    startSearch: "Iniciar busca",
    stopSearch: "Parar",
    pause: "Pausar",
    resume: "Retomar",
    cells: "Células",
    leads: "Leads",
    credits: "Créditos",
    queuePending: "Lotes na fila local",
    eta: "ETA",
    circuitBreaker: "Circuit breaker",
    rateLimits: "Limites de taxa",
  };

  function t(key) {
    try {
      const msg = chrome.i18n.getMessage(key);
      return msg || FALLBACK[key] || key;
    } catch (_) {
      return FALLBACK[key] || key;
    }
  }

  function send(msg) {
    return chrome.runtime.sendMessage(msg).catch((err) => ({
      ok: false,
      error: { code: "sw_unavailable", message: String((err && err.message) || err) },
    }));
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function humanizeSeconds(total) {
    if (!isFinite(total) || total <= 0) return "–";
    if (total < 90) return Math.round(total) + "s";
    if (total < 5400) return Math.round(total / 60) + "min";
    return (total / 3600).toFixed(1).replace(".", ",") + "h";
  }

  /* ─────────────────────────────── i18n estático ─────────────────────────────── */

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.getElementById("badge").textContent = "Desconectado";
  document.title = t("extName") || "Play Google Scraper";

  /* ─────────────────────────────── renderização ─────────────────────────────── */

  const els = {
    badge: $("badge"),
    token: $("token"),
    btnConnect: $("btn-connect"),
    connInfo: $("conn-info"),
    connError: $("conn-error"),
    tenantName: $("tenant-name"),
    tenantPlan: $("tenant-plan"),
    creditsText: $("credits-text"),
    creditsBar: $("credits-bar"),
    term: $("term"),
    centerLat: $("center-lat"),
    centerLng: $("center-lng"),
    btnUseTab: $("btn-use-tab"),
    radius: $("radius"),
    maxDepth: $("max-depth"),
    speedMode: $("speed-mode"),
    btnStart: $("btn-start"),
    btnPause: $("btn-pause"),
    btnResume: $("btn-resume"),
    btnStop: $("btn-stop"),
    searchError: $("search-error"),
    cellsText: $("cells-text"),
    cellsBar: $("cells-bar"),
    leadsText: $("leads-text"),
    creditsInline: $("credits-inline"),
    etaText: $("eta-text"),
    strategyText: $("strategy-text"),
    circuitText: $("circuit-text"),
    log: $("log"),
    queueCount: $("queue-count"),
    btnDrain: $("btn-drain"),
    errorsCard: $("errors-card"),
    errorsList: $("errors-list"),
    btnClearErrors: $("btn-clear-errors"),
    termsLink: $("terms-link"),
  };

  let lastState = null;
  let embeddedTried = false;

  function showError(el, message) {
    el.textContent = message;
    el.hidden = !message;
  }

  function render(state) {
    if (!state || !state.ok) return;
    lastState = state;

    // Badge de status
    if (state.creditsBlocked) {
      els.badge.textContent = "Bloqueado por créditos";
      els.badge.className = "badge badge-blocked";
    } else if (state.connected) {
      els.badge.textContent = "Conectado";
      els.badge.className = "badge badge-ok";
    } else if (state.notConfigured) {
      els.badge.textContent = "Não configurado";
      els.badge.className = "badge badge-warn";
    } else {
      els.badge.textContent = "Desconectado";
      els.badge.className = "badge badge-off";
    }

    // Conexão
    if (state.connected) {
      els.connInfo.hidden = false;
      showError(els.connError, "");
      els.tenantName.textContent = state.tenant ? state.tenant.name : "–";
      els.tenantPlan.textContent = state.plan ? "plano " + state.plan : "";
      const credits = state.credits;
      if (credits) {
        els.creditsText.textContent = credits.remaining + " / " + credits.limit;
        els.creditsBar.max = Math.max(credits.limit, 1);
        els.creditsBar.value = credits.remaining;
        els.creditsInline.textContent = String(credits.remaining);
      }
      els.token.value = "";
      els.token.placeholder = "conectado via " + (state.tokenPreview || "token");
    }

    // Busca em andamento
    const search = state.search;
    const running = Boolean(state.running);
    els.btnStart.disabled = running || !state.connected;
    els.btnPause.disabled = !running || state.paused;
    els.btnResume.disabled = !running || !state.paused;
    els.btnStop.disabled = !running;

    if (search && !running && !els.term.value) {
      // pré-preenche com a última busca (facilita repetir)
      els.term.placeholder = search.term;
    }

    // Progresso
    const progress = state.progress || { done: 0, total: 0, ratio: 0 };
    els.cellsText.textContent = progress.done + " / " + progress.total;
    els.cellsBar.max = Math.max(progress.total, 1);
    els.cellsBar.value = progress.done;
    els.leadsText.textContent = String(state.leadsFound || 0);

    // ETA: células restantes × (12s de página + 2× delay médio do modo)
    if (search && running && progress.total > progress.done) {
      const avg = window.PGS && window.PGS.humanizer
        ? window.PGS.humanizer.averageDelaySec(search.speedMode)
        : 2.1;
      const remaining = progress.total - progress.done;
      els.etaText.textContent = humanizeSeconds(remaining * (12 + avg * 2));
      els.strategyText.textContent = dominantStrategy(state.strategyCounts);
    } else if (!running) {
      els.etaText.textContent = "–";
      els.strategyText.textContent = "–";
    }

    // Circuit breaker
    const circuit = state.circuit;
    if (circuit && circuit.until > Date.now()) {
      const secs = Math.ceil((circuit.until - Date.now()) / 1000);
      els.circuitText.hidden = false;
      els.circuitText.textContent =
        t("circuitBreaker") + ": pausa " + humanizeSeconds(secs) + " (nível " + circuit.level + " · " + (circuit.reason || "—") + ")";
    } else if (circuit && circuit.level > 0) {
      els.circuitText.hidden = false;
      els.circuitText.textContent = t("circuitBreaker") + ": nível " + circuit.level + " (armado)";
    } else {
      els.circuitText.hidden = true;
    }

    // Log (últimas 8 linhas com timestamps)
    const lines = (state.logs || []).map((entry) => "[" + fmtTime(entry.at) + "] " + entry.line);
    els.log.textContent = lines.length > 0 ? lines.join("\n") : "Sem eventos ainda.";
    els.log.scrollTop = els.log.scrollHeight;

    // Fila local
    els.queueCount.textContent = String(state.queueCount || 0);
    els.btnDrain.disabled = !state.connected || (state.queueCount || 0) === 0;

    // Erros
    const errors = state.errors || [];
    els.errorsCard.hidden = errors.length === 0;
    els.errorsList.innerHTML = "";
    for (const err of errors.slice(-8).reverse()) {
      const li = document.createElement("li");
      li.textContent = "[" + fmtTime(err.at) + "] " + err.message;
      els.errorsList.appendChild(li);
    }

    // Link Termos aponta para a origem do painel
    if (state.tenant) {
      // apiBase não é sensível; o sw devolve junto do snapshot
      if (state.apiBase) els.termsLink.href = state.apiBase + "/#faq";
    }
  }

  function dominantStrategy(counts) {
    if (!counts) return "–";
    const entries = [
      ["payload", counts.payload || 0],
      ["dom", counts.dom || 0],
      ["detail", counts.detail || 0],
    ];
    entries.sort((a, b) => b[1] - a[1]);
    if (entries[0][1] === 0) return "–";
    return entries[0][0] + " (" + entries[0][1] + ")";
  }

  async function refresh() {
    const state = await send({ type: "getState" });
    render(state);

    // Conexão automática com token embutido no download (uma tentativa)
    if (state && state.ok && state.embedded && !state.connected && !embeddedTried) {
      embeddedTried = true;
      const res = await send({ type: "connect", useEmbedded: true });
      if (!res.ok) showError(els.connError, res.error ? res.error.message : "Falha na conexão automática.");
      const fresh = await send({ type: "getState" });
      render(fresh);
    }
  }

  /* ─────────────────────────────── ações ─────────────────────────────── */

  els.btnConnect.addEventListener("click", async () => {
    const token = els.token.value.trim();
    if (!token) {
      showError(els.connError, "Cole o token de API criado no painel web (começa com pgs_live_).");
      return;
    }
    els.btnConnect.disabled = true;
    const res = await send({ type: "connect", token: token });
    els.btnConnect.disabled = false;
    if (!res.ok) {
      showError(els.connError, res.error ? res.error.message : "Falha ao conectar.");
      return;
    }
    showError(els.connError, "");
    refresh();
  });

  els.btnUseTab.addEventListener("click", async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      for (const tab of tabs) {
        const match = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(tab.url || "");
        if (match) {
          els.centerLat.value = match[1];
          els.centerLng.value = match[2];
          showError(els.searchError, "");
          return;
        }
      }
      showError(els.searchError, "A aba ativa não é uma URL do Google Maps com centro (@lat,lng).");
    } catch (err) {
      showError(els.searchError, "Não foi possível ler a aba ativa: " + String((err && err.message) || err));
    }
  });

  els.btnStart.addEventListener("click", async () => {
    showError(els.searchError, "");
    const res = await send({
      type: "startSearch",
      term: els.term.value,
      centerLat: parseFloat(els.centerLat.value),
      centerLng: parseFloat(els.centerLng.value),
      radiusKm: parseFloat(els.radius.value),
      speedMode: els.speedMode.value,
      maxDepth: parseInt(els.maxDepth.value, 10),
    });
    if (!res.ok) {
      showError(els.searchError, res.error ? res.error.message : "Falha ao iniciar a busca.");
      return;
    }
    refresh();
  });

  els.btnPause.addEventListener("click", async () => {
    await send({ type: "pauseSearch" });
    refresh();
  });

  els.btnResume.addEventListener("click", async () => {
    const res = await send({ type: "resumeSearch" });
    if (!res.ok) {
      showError(els.searchError, res.error ? res.error.message : "Falha ao retomar.");
    }
    refresh();
  });

  els.btnStop.addEventListener("click", async () => {
    await send({ type: "stopSearch" });
    refresh();
  });

  els.btnDrain.addEventListener("click", async () => {
    els.btnDrain.disabled = true;
    await send({ type: "drainQueue" });
    refresh();
  });

  els.btnClearErrors.addEventListener("click", async () => {
    await send({ type: "clearErrors" });
    refresh();
  });

  // Eventos em tempo real vindos do sw
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "PGS_EVENT") refresh();
    return false;
  });

  // Polling de segurança + primeiro render
  refresh();
  setInterval(refresh, 2000);
})();
