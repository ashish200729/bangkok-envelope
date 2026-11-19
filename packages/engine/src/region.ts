import {
  Clipper,
  ClipType,
  FillRule,
  type Path64,
  type Paths64,
  type PolyPath64,
  PolyTree64,
} from "clipper2-ts";
import type { LocalEdge } from "./plot";
import type { XY } from "./projection";

/**
 * Clipper works in integers; local metres are scaled to tenths of a millimetre, so the rounding
 * of intersections, repeated band after band, stays well under a millimetre.
 */
export const UNITS_PER_M = 10_000;
/** Arcs are drawn outside the true circle by at most this much, so cuts err on the safe side. */
const ARC_TOLERANCE_M = 0.03;
const MAX_ARC_STEPS = 64;
/** Pieces smaller than this are numerical crumbs, not floor space. */
const CRUMB_M2 = 0.01;

/** A polygon in local metres: outer ring counter-clockwise, holes clockwise, rings open. */
export type LocalPolygon = { outer: readonly XY[]; holes: readonly (readonly XY[])[] };

/** The part of the plot a building may cover at one height. */
export type Region = {
  polygons: readonly LocalPolygon[];
  areaM2: number;
  /** Clipper paths in UNITS_PER_M units, outer rings positive. */
  paths: Paths64;
  /** The per-side distances this region honours. */
  distances: readonly number[];
};

function toPath64(points: readonly XY[]): Path64 {
  return points.map((p) => ({
    x: Math.round(p.x * UNITS_PER_M),
    y: Math.round(p.y * UNITS_PER_M),
  }));
}

function fromPath64(path: Path64): XY[] {
  return path.map((p) => ({ x: p.x / UNITS_PER_M, y: p.y / UNITS_PER_M }));
}

function arcSteps(radiusM: number): number {
  const half = Math.acos(radiusM / (radiusM + ARC_TOLERANCE_M));
  return Math.min(MAX_ARC_STEPS, Math.max(2, Math.ceil(Math.PI / (2 * half))));
}

/**
 * Every point within `radius` of the segment ab (a stadium), counter-clockwise. The round caps are
 * circumscribed polygons: each arc chord is tangent to the true circle, so the shape contains the
 * true stadium and points left outside it are at least `radius` from the segment.
 */
export function stadium(a: XY, b: XY, radiusM: number): XY[] {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const steps = arcSteps(radiusM);
  const step = Math.PI / steps;
  const reach = radiusM / Math.cos(step / 2);
  const cap = (centre: XY, start: number): XY[] => {
    const points: XY[] = [
      { x: centre.x + radiusM * Math.cos(start), y: centre.y + radiusM * Math.sin(start) },
    ];
    for (let k = 0; k < steps; k++) {
      const t = start + (k + 0.5) * step;
      points.push({ x: centre.x + reach * Math.cos(t), y: centre.y + reach * Math.sin(t) });
    }
    const end = start + Math.PI;
    points.push({ x: centre.x + radiusM * Math.cos(end), y: centre.y + radiusM * Math.sin(end) });
    return points;
  };
  return [...cap(b, angle - Math.PI / 2), ...cap(a, angle + Math.PI / 2)];
}

/**
 * The plot minus, for each side i, every point closer than distances[i] to that side. True
 * segment distance (round caps), so the distance also holds around concave corners.
 *
 * Given `within`, a region for distances no larger than these, only the sides whose distance
 * grew are cut from it: cuts only grow, so the result is the same set and far cheaper to get.
 */
export function allowedRegion(
  vertices: readonly XY[],
  edges: readonly LocalEdge[],
  distances: readonly number[],
  start?: Region,
): Region {
  const within = start?.distances.every((done, i) => done <= (distances[i] ?? 0))
    ? start
    : undefined;
  const cuts: Paths64 = [];
  edges.forEach((edge, i) => {
    const d = distances[i] ?? 0;
    const done = within?.distances[i] ?? 0;
    if (d > 0 && (!within || d > done)) cuts.push(toPath64(stadium(edge.a, edge.b, d)));
  });
  if (within && cuts.length === 0) return { ...within, distances };
  const subject = within ? within.paths : [toPath64(vertices)];
  const tree = new PolyTree64();
  Clipper.booleanOpWithPolyTree(ClipType.Difference, subject, cuts, tree, FillRule.NonZero);
  const polygons: LocalPolygon[] = [];
  const paths: Paths64 = [];
  let areaM2 = 0;
  collect(tree, polygons, paths, (a) => {
    areaM2 += a;
  });
  return { polygons, areaM2, paths, distances };
}

const AREA_UNITS_PER_M2 = UNITS_PER_M * UNITS_PER_M;

function collect(
  node: PolyPath64,
  polygons: LocalPolygon[],
  paths: Paths64,
  addArea: (areaM2: number) => void,
): void {
  for (let i = 0; i < node.count; i++) {
    const outerNode = node.child(i);
    const outer = outerNode.polygon;
    if (!outer) continue;
    const holes: Path64[] = [];
    for (let j = 0; j < outerNode.count; j++) {
      const holeNode = outerNode.child(j);
      if (holeNode.polygon) holes.push(holeNode.polygon);
      collect(holeNode, polygons, paths, addArea);
    }
    const area =
      (Math.abs(Clipper.area(outer)) -
        holes.reduce((sum, h) => sum + Math.abs(Clipper.area(h)), 0)) /
      AREA_UNITS_PER_M2;
    if (area < CRUMB_M2) continue;
    const ccwOuter = Clipper.isPositive(outer) ? outer : Clipper.reversePath(outer);
    const cwHoles = holes.map((h) => (Clipper.isPositive(h) ? Clipper.reversePath(h) : h));
    paths.push(ccwOuter, ...cwHoles);
    polygons.push({ outer: fromPath64(ccwOuter), holes: cwHoles.map(fromPath64) });
    addArea(area);
  }
}

/** Area of the symmetric difference of two regions, in m². */
export function differenceAreaM2(a: Region, b: Region): number {
  return (
    Math.abs(Clipper.areaPaths(Clipper.xor(a.paths, b.paths, FillRule.NonZero))) / AREA_UNITS_PER_M2
  );
}
