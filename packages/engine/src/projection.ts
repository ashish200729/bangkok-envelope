import type { LngLat } from "./geo";

/** Local plane coordinates in metres: x east, y north. */
export type XY = { x: number; y: number };

export type Projection = {
  origin: LngLat;
  toLocal: (position: LngLat) => XY;
  toLngLat: (point: XY) => LngLat;
};

const RAD = Math.PI / 180;

/**
 * Equirectangular projection around `origin`, scaled with WGS84 metres-per-degree series at the
 * origin's latitude. Over a few hundred metres the error is well under 0.01%.
 */
export function makeProjection(origin: LngLat): Projection {
  const phi = origin[1] * RAD;
  const mPerDegLat =
    111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi) - 0.0023 * Math.cos(6 * phi);
  const mPerDegLng =
    111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi) + 0.118 * Math.cos(5 * phi);
  return {
    origin,
    toLocal: ([lng, lat]) => ({
      x: (lng - origin[0]) * mPerDegLng,
      y: (lat - origin[1]) * mPerDegLat,
    }),
    toLngLat: ({ x, y }) => [origin[0] + x / mPerDegLng, origin[1] + y / mPerDegLat],
  };
}

/** Area centroid of a ring in lng/lat (planar; fine at plot scale). Falls back to the mean. */
export function ringCentroid(vertices: readonly LngLat[]): LngLat {
  const first = vertices[0];
  if (!first) return [0, 0];
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i] as LngLat;
    const b = vertices[(i + 1) % vertices.length] as LngLat;
    const ax = a[0] - first[0];
    const ay = a[1] - first[1];
    const bx = b[0] - first[0];
    const by = b[1] - first[1];
    const cross = ax * by - bx * ay;
    area2 += cross;
    cx += (ax + bx) * cross;
    cy += (ay + by) * cross;
    mx += ax;
    my += ay;
  }
  if (Math.abs(area2) < 1e-18) {
    return [first[0] + mx / vertices.length, first[1] + my / vertices.length];
  }
  return [first[0] + cx / (3 * area2), first[1] + cy / (3 * area2)];
}

/** Distance in metres, measured exactly as the engine measures (local WGS84 plane). */
export function distanceM(a: LngLat, b: LngLat): number {
  const projection = makeProjection(a);
  const p = projection.toLocal(b);
  return Math.hypot(p.x, p.y);
}

/** Area in m² of a ring (open or closed), measured exactly as the engine measures plots. */
export function ringAreaM2(vertices: readonly LngLat[]): number {
  if (vertices.length < 3) return 0;
  const projection = makeProjection(ringCentroid(vertices));
  const points = vertices.map(projection.toLocal);
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as XY;
    const b = points[(i + 1) % points.length] as XY;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}
