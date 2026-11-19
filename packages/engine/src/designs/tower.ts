import type { Paths64 } from "clipper2-ts";
import type { LocalSlice } from "../envelope";
import type { SiteAnalysis } from "../evaluate";
import type { FloorUse } from "../outputs";
import type { XY } from "../projection";
import { type TowerSpec, towerSpecSchema } from "../spec";
import { DESIGN_ASSUMPTIONS } from "./assumptions";
import {
  deepestPoint,
  directionOf,
  intersect,
  largestPiece,
  type Plate,
  rectangle,
  rotationOf,
} from "./plates";
import {
  type PlateCache,
  type Scheme,
  sliceIndexForTop,
  steppedStack,
  type TowerRect,
} from "./stack";

/** How far the tower may slide from the podium's centre, away from the road, to dodge its height plane. */
const SHIFTS_M = [0, 4, 8, 12];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const SIZE = towerSpecSchema.shape.widthM;
const OFFSET = towerSpecSchema.shape.offsetM.shape.x;
const bounded = (v: number, schema: { minValue: number | null; maxValue: number | null }) =>
  clamp(v, schema.minValue ?? -Infinity, schema.maxValue ?? Infinity);

/** Unit vector along the plot's longest road side. */
export function roadDirection(site: SiteAnalysis): XY {
  let best = site.plot.edges[0];
  for (const edge of site.plot.edges) {
    if (edge.side.kind === "road" && (best?.side.kind !== "road" || edge.lengthM > best.lengthM)) {
      best = edge;
    }
  }
  if (!best) return { x: 1, y: 0 };
  return { x: (best.b.x - best.a.x) / best.lengthM, y: (best.b.y - best.a.y) / best.lengthM };
}

const anchors = new WeakMap<readonly LocalSlice[], XY>();

/**
 * The point tower offsets are measured from: the deepest point of the low-rise envelope's ground
 * slice, so it stays put when the design switches envelope.
 */
export function siteAnchor(lowRise: readonly LocalSlice[]): XY {
  const hit = anchors.get(lowRise);
  if (hit) return hit;
  const anchor = deepestPoint(largestPiece(lowRise[0]?.region.paths ?? []));
  anchors.set(lowRise, anchor);
  return anchor;
}

/** The tower rectangle a spec describes, centred `offsetM` from the site's anchor point. */
export function towerRect(anchor: XY, spec: TowerSpec): TowerRect {
  const centre = { x: anchor.x + spec.offsetM.x, y: anchor.y + spec.offsetM.y };
  return {
    spec,
    paths: rectangle(centre, directionOf(spec.rotationDeg), spec.widthM, spec.depthM),
    key: `${spec.widthM},${spec.depthM},${spec.rotationDeg},${spec.offsetM.x},${spec.offsetM.y}`,
  };
}

/** A tower spec for a rectangle centred on `centre`, kept within the spec's bounds. */
export function towerSpecAt(
  anchor: XY,
  centre: XY,
  axis: XY,
  widthM: number,
  depthM: number,
): TowerSpec {
  return {
    widthM: bounded(widthM, SIZE),
    depthM: bounded(depthM, SIZE),
    rotationDeg: rotationOf(axis),
    offsetM: {
      x: bounded(centre.x - anchor.x, OFFSET),
      y: bounded(centre.y - anchor.y, OFFSET),
    },
  };
}

/**
 * The tower rectangle: the target area deep inside the podium, its long side along the road or
 * across it. Of the shapes and positions tried, the one that keeps the most area on the podium
 * and at the tower's mid-height (where the road plane may already cut) wins.
 */
export function towerBase(
  below: Plate,
  direction: XY,
  targetM2: number,
  midHeightRegion: Paths64,
  anchor: XY,
): TowerRect | null {
  const centre = deepestPoint(below);
  const inward = { x: -direction.y, y: direction.x };
  const reference = intersect(below.paths, midHeightRegion);
  let best: TowerSpec | null = null;
  let bestScore = 0;
  for (const shift of SHIFTS_M) {
    const at = { x: centre.x + inward.x * shift, y: centre.y + inward.y * shift };
    for (const aspect of DESIGN_ASSUMPTIONS.towerAspects.value) {
      const length = Math.sqrt(targetM2 * aspect);
      for (const axis of [direction, inward]) {
        const rect = rectangle(at, axis, length, targetM2 / length);
        const score = intersect(rect, below.paths).areaM2 + intersect(rect, reference.paths).areaM2;
        if (score > bestScore + 0.5) {
          best = towerSpecAt(anchor, at, axis, length, targetM2 / length);
          bestScore = score;
        }
      }
    }
  }
  return best ? towerRect(anchor, best) : null;
}

/** A podium of lobby and parking filling the high-rise envelope, and a compact tower on it. */
export function towerScheme(options: {
  cache: PlateCache;
  use: FloorUse;
  useHeightM: number;
  /** Unit vector along the longest road frontage. */
  direction: XY;
  targetM2: number;
  /** About half-way up a tower that holds the allowed floor area. */
  midHeightM: number;
  /** The site's anchor point that tower offsets are measured from. */
  anchor: XY;
}): Scheme {
  const { cache, use, useHeightM, direction, targetM2, anchor } = options;
  const minPlate = DESIGN_ASSUMPTIONS.minTowerPlateM2.value;
  const slices = cache.set.slices;
  const midIndex =
    sliceIndexForTop(cache.set, options.midHeightM) ?? Math.max(0, slices.length - 1);
  const midRegion = slices[midIndex]?.region.paths ?? [];
  const bases = new Map<number, TowerRect | null>();
  const towerOn = (podiumTop: Plate): TowerRect | null => {
    const hit = bases.get(podiumTop.id);
    if (hit !== undefined) return hit;
    const base = towerBase(podiumTop, direction, targetM2, midRegion, anchor);
    bases.set(podiumTop.id, base);
    return base;
  };
  return {
    grounds: ["lobby"],
    minPartialM2: minPlate,
    stack: (program, groundCapM2, budget) =>
      steppedStack({
        cache,
        program,
        use,
        useHeightM,
        groundCapM2,
        budget,
        minPlateM2: minPlate,
        towerOn,
      }),
  };
}
