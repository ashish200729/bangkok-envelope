import { type Design, makeProjection, type XY } from "@envelope/engine";
import { outlinePolygons } from "@/lib/results/designs";
import { openRing } from "./geometry";
import type { Xyz } from "./massing";
import type { SunPosition } from "./sun";

/** Shadows longer than this many times the building's height are left out (sun near the horizon). */
const MAX_LENGTH_FACTOR = 4;

/** Andrew's monotone chain. */
export function convexHull(points: readonly XY[]): XY[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: XY[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2] as XY, lower[lower.length - 1] as XY, p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: XY[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i] as XY;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2] as XY, upper[upper.length - 1] as XY, p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * The building's shadow on flat ground for a sun position: the hull of the footprint and every
 * floor's top outline pushed away from the sun by height ÷ tan(altitude). Exact for a convex
 * block, a close outline for a podium and tower. Null when the sun is down or nearly so.
 */
export function groundShadow(design: Design, sun: SunPosition, z = 0.3): Xyz[] | null {
  if (sun.altitudeDeg < 4) return null;
  const first = design.floors[0]?.outline[0]?.[0];
  if (!first) return null;
  const projection = makeProjection(first);
  const tanAlt = Math.tan((sun.altitudeDeg * Math.PI) / 180);
  const az = (sun.azimuthDeg * Math.PI) / 180;
  // Shadows fall away from the sun: opposite to the azimuth (x east, y north).
  const away = { x: -Math.sin(az), y: -Math.cos(az) };
  const points: XY[] = [];
  for (const floor of design.floors) {
    const top = floor.z0M + floor.heightM;
    const length = Math.min(top / tanAlt, top * MAX_LENGTH_FACTOR);
    for (const polygon of outlinePolygons(floor.outline)) {
      for (const p of openRing(polygon[0] ?? []).map(projection.toLocal)) {
        if (floor.level === 0) points.push(p);
        points.push({ x: p.x + away.x * length, y: p.y + away.y * length });
      }
    }
  }
  const hull = convexHull(points);
  if (hull.length < 3) return null;
  return [...hull, hull[0] as XY].map((p) => {
    const [lng, lat] = projection.toLngLat(p);
    return [lng, lat, z];
  });
}
