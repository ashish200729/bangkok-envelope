import {
  distanceM as engineDistanceM,
  type LngLat,
  makeProjection,
  ringAreaM2,
} from "@envelope/engine";

/** Distance in metres, the same measure the engine uses. */
export const distanceM = engineDistanceM;

/** Length of each side; side i runs from vertex i to vertex i + 1. */
export function sideLengthsM(vertices: readonly LngLat[]): number[] {
  return vertices.map((v, i) => {
    const next = vertices[(i + 1) % vertices.length];
    return next ? distanceM(v, next) : 0;
  });
}

/** Total length of the outline; `closed` adds the side from the last vertex back to the first. */
export function perimeterM(vertices: readonly LngLat[], closed = true): number {
  if (vertices.length < 2) return 0;
  const lengths = sideLengthsM(vertices);
  if (!closed || vertices.length === 2) lengths.pop();
  return lengths.reduce((sum, length) => sum + length, 0);
}

/** Compass bearing from a to b in degrees clockwise from north, [0, 360); NaN if a = b. */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const { x, y } = makeProjection(a).toLocal(b);
  if (x === 0 && y === 0) return Number.NaN;
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

/** True when the outline runs counter-clockwise with north up, so its inside is on the left. */
export function isCounterClockwise(vertices: readonly LngLat[]): boolean {
  let sum = 0;
  vertices.forEach((a, i) => {
    const b = vertices[(i + 1) % vertices.length] ?? a;
    sum += a[0] * b[1] - b[0] * a[1];
  });
  return sum >= 0;
}

/**
 * Interior angle at each vertex of the closed outline, in degrees (0, 360): above 180 at a
 * reflex (inward) corner. NaN at a corner that shares its position with a neighbour.
 */
export function interiorAnglesDeg(vertices: readonly LngLat[]): number[] {
  const n = vertices.length;
  if (n < 3) return [];
  const ccw = isCounterClockwise(vertices);
  return vertices.map((v, i) => {
    const toPrev = bearingDeg(v, vertices[(i - 1 + n) % n] ?? v);
    const toNext = bearingDeg(v, vertices[(i + 1) % n] ?? v);
    const turn = ccw ? toNext - toPrev : toPrev - toNext;
    return (turn + 360) % 360;
  });
}

/** Area in square metres, the same measure the engine uses; 0 for fewer than three vertices. */
export const areaM2 = ringAreaM2;

export function midpoint(a: LngLat, b: LngLat): LngLat {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}
