/**
 * Rate limit em memória local (fase do sandbox — ver ADR-001).
 * Interface pronta para trocar por Upstash Redis em produção: apenas esta
 * implementação muda; os chamadores continuam iguais.
 */

type Bucket = {
  hits: number[];
};

const buckets = new Map<string, Bucket>();

// Evita crescimento sem limite do mapa (chaves = IP/token).
const MAX_BUCKETS = 10_000;
const BUCKET_TTL_MS = 60 * 60 * 1000;

function prune(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.hits.length === 0 || now - bucket.hits[bucket.hits.length - 1] > BUCKET_TTL_MS) {
      buckets.delete(key);
    }
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAtMs: number;
};

/**
 * Sliding window por chave. Ex.: rateLimit(`ip:${ip}`, 5, 60_000)
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  if (buckets.size > MAX_BUCKETS) prune();

  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0] ?? now;
    return { ok: false, remaining: 0, resetAtMs: oldest + windowMs };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true, remaining: limit - bucket.hits.length, resetAtMs: now + windowMs };
}

/** Extrai o IP do request respeitando o gateway local (Caddy). */
export function requestIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
