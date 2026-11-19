import { distanceToSegment, type XY } from "@envelope/engine";

/** An open ring of local points (metres, x east, y north). */
export type Ring = readonly XY[];

/** Drops the closing point of a GeoJSON-style ring, if present. */
export function openRing<T extends readonly number[] | XY>(ring: readonly T[]): T[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 1 && first && last && same(first, last)) return ring.slice(0, -1);
  return [...ring];
}

function same(a: readonly number[] | XY, b: readonly number[] | XY): boolean {
  if ("x" in a && "x" in b) return a.x === b.x && a.y === b.y;
  const p = a as readonly number[];
  const q = b as readonly number[];
  return p[0] === q[0] && p[1] === q[1];
}

export function signedAreaXY(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as XY;
    const b = ring[(i + 1) % ring.length] as XY;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Counter-clockwise copy, so every edge's outward normal is (dy, −dx). */
export function ccw(ring: Ring): XY[] {
  return signedAreaXY(ring) < 0 ? [...ring].reverse() : [...ring];
}

export function pointInRing(p: XY, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i] as XY;
    const b = ring[j] as XY;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function distanceToRing(p: XY, ring: Ring): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ring.length; i++) {
    const d = distanceToSegment(p, ring[i] as XY, ring[(i + 1) % ring.length] as XY);
    if (d < best) best = d;
  }
  return best;
}

export type Edge = {
  a: XY;
  b: XY;
  length: number;
  /** Unit direction a → b. */
  dir: XY;
  /** Unit outward normal (for a counter-clockwise ring). */
  normal: XY;
  /** Degrees counter-clockwise from east: the yaw that lines a box up with the edge. */
  yawDeg: number;
};

/**
 * Edges of a counter-clockwise ring, with near-collinear runs merged (curved cuts arrive as many
 * short sides; a façade rhythm reads along the run, not per tiny side).
 */
export function ringEdges(ring: Ring, mergeTurnDeg = 6): Edge[] {
  const pts = simplify(ring, mergeTurnDeg);
  const edges: Edge[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as XY;
    const b = pts[(i + 1) % pts.length] as XY;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) continue;
    const dir = { x: dx / length, y: dy / length };
    edges.push({
      a,
      b,
      length,
      dir,
      normal: { x: dir.y, y: -dir.x },
      yawDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    });
  }
  return edges;
}

function simplify(ring: Ring, turnDeg: number): XY[] {
  const limit = (turnDeg * Math.PI) / 180;
  let pts = [...ring];
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length > 3; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length] as XY;
      const here = pts[i] as XY;
      const next = pts[(i + 1) % pts.length] as XY;
      const a = Math.atan2(here.y - prev.y, here.x - prev.x);
      const b = Math.atan2(next.y - here.y, next.x - here.x);
      const turn = Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
      const tiny = Math.hypot(here.x - prev.x, here.y - prev.y) < 0.05;
      if (turn < limit || tiny) {
        pts = pts.filter((_, k) => k !== i);
        changed = true;
      }
    }
  }
  return pts;
}

/**
 * Offsets a counter-clockwise ring outward by `d` metres (inward when negative) with mitred
 * corners, capped so sharp corners do not spike. Good for the small offsets used for slab edges
 * and highlight outlines; not a general polygon offset.
 */
export function offsetRing(ring: Ring, d: number, miterLimit = 3): XY[] {
  const n = ring.length;
  const out: XY[] = [];
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n] as XY;
    const here = ring[i] as XY;
    const next = ring[(i + 1) % n] as XY;
    const n1 = unitNormal(prev, here);
    const n2 = unitNormal(here, next);
    let mx = n1.x + n2.x;
    let my = n1.y + n2.y;
    const len = Math.hypot(mx, my);
    if (len < 1e-9) {
      out.push({ x: here.x + n1.x * d, y: here.y + n1.y * d });
      continue;
    }
    mx /= len;
    my /= len;
    const cos = mx * n1.x + my * n1.y;
    const scale = Math.min(1 / Math.max(cos, 1e-6), miterLimit);
    out.push({ x: here.x + mx * d * scale, y: here.y + my * d * scale });
  }
  return out;
}

function unitNormal(a: XY, b: XY): XY {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dy / len, y: -dx / len };
}

export function ringCentroidXY(ring: Ring): XY {
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i] as XY;
    const q = ring[(i + 1) % ring.length] as XY;
    const cross = p.x * q.y - q.x * p.y;
    a2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a2) < 1e-9) {
    const sum = ring.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / ring.length, y: sum.y / ring.length };
  }
  return { x: cx / (3 * a2), y: cy / (3 * a2) };
}
