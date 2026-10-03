/**
 * queue.js — fila durável de lotes em IndexedDB (ADR-002, D5/D4).
 *
 * Regra INVIOLÁVEL: leads NUNCA são descartados. Se a rede cai, o servidor
 * responde 429 (rate limit) ou 402 (créditos), o lote entra na fila e é
 * reenviado depois ("Forçar reenvio" na Side Panel chama drainQueue).
 *
 * Banco: "pgs-queue" — store "batches" (keyPath auto, body, idempotencyKey,
 * createdAt, attempts). Roda no service worker (contexto trusted).
 */
/* global PGS */

(function () {
  "use strict";

  const DB_NAME = "pgs-queue";
  const DB_VERSION = 1;
  const STORE = "batches";
  const MAX_ATTEMPTS = 10; // trava de segurança: lote inválido não gira para sempre

  /** Abre (e migra) o banco. */
  function openQueue() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
          store.createIndex("createdAt", "createdAt");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("indexedDB_open_failed"));
      req.onblocked = () => reject(new Error("indexedDB_blocked"));
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("indexedDB_tx_failed"));
      tx.onabort = () => reject(tx.error || new Error("indexedDB_tx_aborted"));
    });
  }

  /**
   * Enfileira um lote pronto para POST /api/v1/leads/batch.
   * @param {Array<PGS.LeadBatchItem>} body corpo {leads:[...]}
   * @param {string} idempotencyKey sha256 dos place_ids do lote
   */
  async function enqueueBatch(body, idempotencyKey) {
    const db = await openQueue();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({
      body,
      idempotencyKey,
      createdAt: Date.now(),
      attempts: 0,
    });
    await txDone(tx);
    db.close();
  }

  /** Quantidade de lotes pendentes (Side Panel mostra em tempo real). */
  async function pendingCount() {
    const db = await openQueue();
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    const count = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("indexedDB_count_failed"));
    });
    db.close();
    return count;
  }

  /**
   * Drena a fila em ordem de criação. Para no primeiro erro (preserva ordem).
   * @param {(body: unknown, idempotencyKey: string) => Promise<boolean>} sendBatchFn
   *        deve resolver true se o lote foi aceito (200) ou descartável
   *        (ex.: 422 validação — reenviar não adiantaria); false/throw = retry depois.
   * @returns {{drained: number, remaining: number}}
   */
  async function drainQueue(sendBatchFn) {
    const db = await openQueue();
    let drained = 0;
    try {
      // Lê todos ordenados por id (ordem de criação — FIFO)
      const txRead = db.transaction(STORE, "readonly");
      const allReq = txRead.objectStore(STORE).getAll();
      const all = await new Promise((resolve, reject) => {
        allReq.onsuccess = () => resolve(allReq.result || []);
        allReq.onerror = () => reject(allReq.error || new Error("indexedDB_getAll_failed"));
      });
      all.sort((a, b) => a.id - b.id);

      for (const record of all) {
        try {
          const ok = await sendBatchFn(record.body, record.idempotencyKey);
          if (ok) {
            const txDel = db.transaction(STORE, "readwrite");
            txDel.objectStore(STORE).delete(record.id);
            await txDone(txDel);
            drained += 1;
          } else {
            break; // falha temporária (rede/429/402) — preserva o resto em ordem
          }
        } catch {
          break;
        }
      }
    } finally {
      db.close();
    }
    const remaining = await pendingCount();
    return { drained, remaining };
  }

  /** Incrementa attempts (chamado pelo sw quando um lote falha novamente). */
  async function bumpAttempts() {
    const db = await openQueue();
    const txRead = db.transaction(STORE, "readonly");
    const allReq = txRead.objectStore(STORE).getAll();
    const all = await new Promise((resolve, reject) => {
      allReq.onsuccess = () => resolve(allReq.result || []);
      allReq.onerror = () => reject(allReq.error);
    });
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const record of all) {
      const attempts = (record.attempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        // Lote recusado 10× — provavelmente inválido (schema mudou). Preserva
        // os dados marcando attempts; o operador decide limpá-lo manualmente.
        store.put(Object.assign({}, record, { attempts, poisoned: true }));
      } else {
        store.put(Object.assign({}, record, { attempts }));
      }
    }
    await txDone(tx);
    db.close();
  }

  /** Limpa a fila inteira (usado por "limpar fila envenenada" — ação explícita). */
  async function clearAll() {
    const db = await openQueue();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    await txDone(tx);
    db.close();
  }

  PGS.queue = {
    enqueueBatch,
    pendingCount,
    drainQueue,
    bumpAttempts,
    clearAll,
  };
})();
