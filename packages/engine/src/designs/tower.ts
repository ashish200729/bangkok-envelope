import type { Paths64 } from "clipper2-ts";
import type { FloorUse } from "../outputs";
import type { XY } from "../projection";
import { DESIGN_ASSUMPTIONS } from "./assumptions";
import { deepestPoint, EMPTY_PLATE, intersect, type Plate, rectangle } from "./plates";
import { type PlateCache, type Scheme, sliceIndexForTop, steppedStack } from "./stack";

/** How far the tower may slide from the podium's centre, away from the road, to dodge its height plane. */
const SHIFTS_M = [0, 4, 8, 12];

/**
 * The tower plate: a rectangle of the target area deep inside the podium, its long side along
 * the road or across it. Of the shapes and positions tried, the one that keeps the most area on
 * the podium and at the tower's mid-height (where the road plane may already cut) wins.
 */
export function towerBase(
  below: Plate,
  direction: XY,
  targetM2: number,
  midHeightRegion: Paths64,
): Plate {
  const centre = deepestPoint(below);
  const inward = { x: -direction.y, y: direction.x };
  const reference = intersect(below.paths, midHeightRegion);
  let best = EMPTY_PLATE;
  let bestScore = 0;
  for (const shift of SHIFTS_M) {
    const at = { x: centre.x + inward.x * shift, y: centre.y + inward.y * shift };
    for (const aspect of DESIGN_ASSUMPTIONS.towerAspects.value) {
      const length = Math.sqrt(targetM2 * aspect);
      for (const axis of [direction, inward]) {
        const rect = rectangle(at, axis, length, targetM2 / length);
        const plate = intersect(rect, below.paths);
        const score = plate.areaM2 + intersect(rect, reference.paths).areaM2;
        if (score > bestScore + 0.5) {
          best = plate;
          bestScore = score;
        }
      }
    }
  }
  return best;
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
}): Scheme {
  const { cache, use, useHeightM, direction, targetM2 } = options;
  const minPlate = DESIGN_ASSUMPTIONS.minTowerPlateM2.value;
  const slices = cache.set.slices;
  const midIndex =
    sliceIndexForTop(cache.set, options.midHeightM) ?? Math.max(0, slices.length - 1);
  const midRegion = slices[midIndex]?.region.paths ?? [];
  const bases = new Map<number, Plate>();
  const narrowToTower = (below: Plate): Plate => {
    const hit = bases.get(below.id);
    if (hit) return hit;
    const base = towerBase(below, direction, targetM2, midRegion);
    bases.set(below.id, base);
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
        narrowToTower,
      }),
  };
}
