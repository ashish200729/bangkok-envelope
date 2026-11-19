import { type LngLat, type MultiPolygon, makeProjection, type XY } from "@envelope/engine";
import { outlinePolygons } from "@/lib/results/designs";
import type { AnyDesign as Design } from "@/lib/results/view";
import { ccw, distanceToRing, openRing, pointInRing } from "./geometry";
import type { FlatPolygon, Xyz } from "./massing";
import { type Rgb, SCENE_COLORS } from "./materials";
import { hash01 } from "./random";

export type Tree = { position: Xyz; heightM: number; radiusM: number; color: Rgb };

export type Landscape = { ground: FlatPolygon[]; trees: Tree[] };

/** Trees keep at least this far from the plot's sides. */
export const EDGE_CLEARANCE_M = 2;
/** Tree trunks keep at least this far from the building. */
export const BUILDING_CLEARANCE_M = 3;
const TREE_SPACING_M = 9;
/** A share of grid spots left empty, so the planting looks placed rather than gridded. */
const GAP_SHARE = 0.35;
const MAX_TREES = 40;

/**
 * Trees sit on a grid fixed to the ground rather than to the plot, so dragging a corner moves only
 * the trees near the change instead of reshuffling them all.
 */
export const GRID_ORIGIN: LngLat = [100.5, 13.75];

export type LandscapeInput = {
  /** The plot as an open ring (engine input order). */
  plot: readonly LngLat[];
  design: Design;
  /** The buildable ground (the envelope's lowest slice); the rest of the plot is setback. */
  buildable: MultiPolygon | null;
};

const cache = new WeakMap<
  Design,
  { plot: readonly LngLat[]; buildable: unknown; value: Landscape }
>();

/** Ground and a few trees on the open ground around a design. Cached per design. */
export function siteLandscape(input: LandscapeInput): Landscape {
  const hit = cache.get(input.design);
  if (hit && hit.plot === input.plot && hit.buildable === input.buildable) return hit.value;
  const value = buildLandscape(input);
  cache.set(input.design, { plot: input.plot, buildable: input.buildable, value });
  return value;
}

function buildLandscape({ plot, design, buildable }: LandscapeInput): Landscape {
  const projection = makeProjection(GRID_ORIGIN);
  const at = (p: XY, z: number): Xyz => {
    const [lng, lat] = projection.toLngLat(p);
    return [lng, lat, z];
  };
  const close = (ring: readonly XY[], z: number) => [...ring, ring[0] as XY].map((p) => at(p, z));
  const plotRing = ccw(openRing(plot).map(projection.toLocal));
  const buildings = design.floors
    .filter((floor) => floor.level === 0)
    .flatMap((floor) => outlinePolygons(floor.outline))
    .map((polygon) => ccw(openRing(polygon[0] ?? []).map(projection.toLocal)))
    .filter((ring) => ring.length >= 3);
  const ground: FlatPolygon[] = [];
  if (plotRing.length < 3) return { ground, trees: [] };

  ground.push({ polygon: [close(plotRing, 0.04)], color: SCENE_COLORS.plotGround });
  for (const polygon of buildable ?? []) {
    const rings = polygon.map((ring) => openRing(ring).map(projection.toLocal));
    if ((rings[0]?.length ?? 0) < 3) continue;
    ground.push({ polygon: rings.map((r) => close(r, 0.1)), color: SCENE_COLORS.lawn });
  }

  const trees = placeTrees(plotRing, buildings).map((p): Tree => {
    const r = hash01(Math.round(p.x * 10), Math.round(p.y * 10), 7);
    return {
      position: at(p, 0),
      heightM: 7 + r * 3,
      radiusM: 2.3 + r * 0.9,
      color: SCENE_COLORS.canopy[Math.floor(r * 3) % 3] as Rgb,
    };
  });
  return { ground, trees };
}

/** Spots on the ground grid that are inside the plot and clear of its sides and the building. */
export function placeTrees(plot: readonly XY[], buildings: readonly (readonly XY[])[]): XY[] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of plot) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const insideBuilding = (p: XY) => buildings.some((b) => pointInRing(p, b));
  const nearBuilding = (p: XY) =>
    buildings.some((b) => distanceToRing(p, b) < BUILDING_CLEARANCE_M);
  const rowStep = TREE_SPACING_M * 0.866;
  const trees: XY[] = [];
  for (let j = Math.floor(minY / rowStep); j * rowStep <= maxY; j++) {
    const shift = (j & 1) * (TREE_SPACING_M / 2);
    for (
      let i = Math.floor((minX - shift) / TREE_SPACING_M);
      i * TREE_SPACING_M + shift <= maxX;
      i++
    ) {
      if (hash01(i, j, 3) < GAP_SHARE) continue;
      const p = {
        x: i * TREE_SPACING_M + shift + (hash01(i, j, 1) - 0.5) * 3,
        y: j * rowStep + (hash01(i, j, 2) - 0.5) * 3,
      };
      if (!pointInRing(p, plot) || distanceToRing(p, plot) < EDGE_CLEARANCE_M) continue;
      if (insideBuilding(p) || nearBuilding(p)) continue;
      trees.push(p);
      if (trees.length >= MAX_TREES) return trees;
    }
  }
  return trees;
}
