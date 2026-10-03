/**
 * Idempotência de ingestão — cache em memória local (ADR-001: sem Upstash no
 * sandbox; a interface é a mesma para trocar por Redis em produção).
 *
 * A extensão envia `Idempotency-Key` (sha256 do lote). Se a mesma chave chegar
 * de novo (retry após queda de rede), devolvemos a resposta original sem
 * reprocessar — nunca duplica crédito nem lead.
 */

type Entry = {
  responseJson: string;
  status: number;
  expiresAt: number;
};

const store = new Map<string, Entry>();
const MAX_ENTRIES = 5_000;
const TTL_MS = 24 * 60 * 60 * 1000;

function prune(): void {
  if (store.size < MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) store.delete(key);
  }
  if (store.size >= MAX_ENTRIES) {
    // Descarta as mais antigas (inserção ordenada em Map).
    const drop = store.size - MAX_ENTRIES + 1;
    let i = 0;
    for (const key of store.keys()) {
      store.delete(key);
      i += 1;
      if (i >= drop) break;
    }
  }
}

export function getIdempotentResponse(key: string): { status: number; json: string } | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return { status: entry.status, json: entry.responseJson };
}

export function setIdempotentResponse(key: string, status: number, json: string): void {
  prune();
  store.set(key, { responseJson: json, status, expiresAt: Date.now() + TTL_MS });
}
