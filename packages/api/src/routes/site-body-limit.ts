import type { Context, MiddlewareHandler } from "hono";

/**
 * Rejects request bodies over `maxSize` bytes, whether or not they declare a Content-Length.
 *
 * Hono's own `bodyLimit` re-wraps a streamed body with `new Request(c.req.raw, init)`, which
 * throws inside Next.js (its `NextRequest` cannot be copied that way) and turned every chunked
 * or body-carrying DELETE into a 500. This version rebuilds the request from its parts.
 */
export function limitBody(
  maxSize: number,
  onError: (c: Context) => Response | Promise<Response>,
): MiddlewareHandler {
  return async (c, next) => {
    const raw = c.req.raw;
    if (!raw.body) return next();

    const declared = raw.headers.get("content-length");
    if (declared !== null && !raw.headers.has("transfer-encoding")) {
      const length = Number(declared);
      return Number.isFinite(length) && length <= maxSize ? next() : onError(c);
    }

    const reader = raw.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxSize) {
        await reader.cancel();
        return onError(c);
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    c.req.raw = new Request(raw.url, {
      method: raw.method,
      headers: raw.headers,
      body,
      signal: raw.signal,
    });
    return next();
  };
}
