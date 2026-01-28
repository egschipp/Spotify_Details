type RateLimitOptions = {
  windowMs: number;
  max: number;
};

type RateLimitState = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitState>();

export function rateLimit(key: string, options: RateLimitOptions) {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now > existing.resetAt) {
    const resetAt = now + options.windowMs;
    const state = { count: 1, resetAt };
    buckets.set(key, state);
    return {
      ok: true,
      remaining: options.max - 1,
      resetAt
    };
  }

  if (existing.count >= options.max) {
    return {
      ok: false,
      remaining: 0,
      resetAt: existing.resetAt
    };
  }

  existing.count += 1;
  return {
    ok: true,
    remaining: options.max - existing.count,
    resetAt: existing.resetAt
  };
}

export function rateLimitHeaders(remaining: number, resetAt: number) {
  const resetSeconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
  return {
    "X-RateLimit-Remaining": remaining.toString(),
    "X-RateLimit-Reset": resetSeconds.toString(),
    "Retry-After": resetSeconds.toString()
  };
}
