import type { Context, MiddlewareHandler } from "hono";
import type { ApiError } from "./app";

export type RateLimitOptions = {
  /** Requests allowed per client within `windowMs`. */
  limit: number;
  windowMs: number;
  /** Clock, injectable for tests. */
  now?: () => number;
};

/** Upper bound on tracked clients, so a flood of spoofed addresses cannot grow memory without end. */
const MAX_CLIENTS = 10_000;

/**
 * The client address. On Vercel `x-forwarded-for` is set by the edge (a client-sent value is
 * overwritten), so its first entry is the real client. Elsewhere the header may be absent and
 * every caller shares one bucket, which errs on the side of limiting.
 */
export function clientKey(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || c.req.header("x-real-ip")?.trim() || "unknown";
}

/**
 * Per-client sliding-window limiter kept in this process's memory. On serverless each instance
 * keeps its own window, so the effective limit is per instance; see docs/decisions.md.
 */
export function rateLimit({
  limit,
  windowMs,
  now = Date.now,
}: RateLimitOptions): MiddlewareHandler {
  const hits = new Map<string, number[]>();

  const sweep = (cutoff: number) => {
    for (const [key, times] of hits) {
      if ((times.at(-1) ?? 0) <= cutoff) hits.delete(key);
    }
    // Still full of live clients: drop the oldest-seen ones rather than grow.
    for (const key of hits.keys()) {
      if (hits.size < MAX_CLIENTS) break;
      hits.delete(key);
    }
  };

  return async (c, next) => {
    const t = now();
    const cutoff = t - windowMs;
    const key = clientKey(c);
    const times = (hits.get(key) ?? []).filter((time) => time > cutoff);

    if (times.length >= limit) {
      hits.set(key, times);
      const retryAfterS = Math.max(1, Math.ceil(((times[0] as number) + windowMs - t) / 1000));
      c.header("Retry-After", String(retryAfterS));
      c.header("Cache-Control", "no-store");
      return c.json<ApiError>(
        {
          error: {
            code: "rate_limited",
            message: `Too many requests. Try again in ${retryAfterS} s.`,
            requestId: c.get("requestId"),
          },
        },
        429,
      );
    }

    times.push(t);
    if (!hits.has(key) && hits.size >= MAX_CLIENTS) sweep(cutoff);
    hits.delete(key);
    hits.set(key, times);
    await next();
  };
}
