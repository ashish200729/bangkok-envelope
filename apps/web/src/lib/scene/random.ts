/**
 * A stable number in [0, 1) for a tuple of integers. Scene details (lit windows, tree jitter)
 * come from this rather than Math.random, so the same design always looks the same.
 */
export function hash01(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    let v = Math.trunc(part) | 0;
    for (let i = 0; i < 4; i++) {
      h ^= v & 0xff;
      h = Math.imul(h, 0x01000193);
      v >>>= 8;
    }
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
