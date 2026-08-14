// Limitador em memória por processo — mesmo padrão simples já usado no
// cliente.avilaops.com (src/lib/rateLimit.ts). Suficiente para uma rota
// administrativa de baixo tráfego; não é adequado se o app rodar com mais
// de uma instância simultânea (nesse caso, trocar por um store
// compartilhado, ex.: Redis/Upstash).
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  limit = 5,
  windowMs = 60_000,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}
