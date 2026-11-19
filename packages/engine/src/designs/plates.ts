import {
  Clipper,
  ClipType,
  EndType,
  FillRule,
  JoinType,
  type Path64,
  type Paths64,
  type PolyPath64,
  PolyTree64,
} from "clipper2-ts";
import { closeRing, type Polygon } from "../geo";
import type { Projection, XY } from "../projection";
import { UNITS_PER_M } from "../region";

const AREA_UNITS_PER_M2 = UNITS_PER_M * UNITS_PER_M;
/** Inset searches stop when the area is within this much under the target. */
const AREA_TOLERANCE_M2 = 0.5;
const SEARCH_STEPS = 30;
/** Halvings of the plate's half-width: 10 find the deepest point to within a few centimetres. */
const DEEPEST_STEPS = 10;
const MITER_LIMIT = 2;

/** One floor plate in local Clipper units: one outer ring (counter-clockwise) and its holes. */
export type Plate = { paths: Paths64; areaM2: number; id: number };

let nextId = 1;

function plate(paths: Paths64, areaM2: number): Plate {
  return { paths, areaM2, id: nextId++ };
}

export const EMPTY_PLATE: Plate = plate([], 0);

type Piece = { outer: Path64; holes: Path64[]; areaM2: number };

function pieces(node: PolyPath64, out: Piece[]): Piece[] {
  for (let i = 0; i < node.count; i++) {
    const outerNode = node.child(i);
    const outer = outerNode.polygon;
    if (!outer) continue;
    const holes: Path64[] = [];
    for (let j = 0; j < outerNode.count; j++) {
      const holeNode = outerNode.child(j);
      if (holeNode.polygon) holes.push(holeNode.polygon);
      pieces(holeNode, out);
    }
    const area =
      (Math.abs(Clipper.area(outer)) - holes.reduce((s, h) => s + Math.abs(Clipper.area(h)), 0)) /
      AREA_UNITS_PER_M2;
    out.push({ outer, holes, areaM2: area });
  }
  return out;
}

/** The largest connected piece: a floor is one piece of building, not scattered crumbs. */
function largestOf(tree: PolyTree64): Plate {
  let best: Piece | undefined;
  for (const piece of pieces(tree, [])) if (!best || piece.areaM2 > best.areaM2) best = piece;
  if (!best || best.areaM2 <= 0) return EMPTY_PLATE;
  const outer = Clipper.isPositive(best.outer) ? best.outer : Clipper.reversePath(best.outer);
  const holes = best.holes.map((h) => (Clipper.isPositive(h) ? Clipper.reversePath(h) : h));
  return plate([outer, ...holes], best.areaM2);
}

export function intersect(a: Paths64, b: Paths64): Plate {
  if (a.length === 0 || b.length === 0) return EMPTY_PLATE;
  const tree = new PolyTree64();
  Clipper.booleanOpWithPolyTree(ClipType.Intersection, a, b, tree, FillRule.NonZero);
  return largestOf(tree);
}

export function largestPiece(paths: Paths64): Plate {
  if (paths.length === 0) return EMPTY_PLATE;
  const tree = new PolyTree64();
  Clipper.booleanOpWithPolyTree(ClipType.Union, paths, [], tree, FillRule.NonZero);
  return largestOf(tree);
}

function inflate(paths: Paths64, insetM: number): Paths64 {
  return Clipper.inflatePaths(
    paths,
    -insetM * UNITS_PER_M,
    JoinType.Miter,
    EndType.Polygon,
    MITER_LIMIT,
  );
}

function areaOf(paths: Paths64): number {
  return Math.abs(Clipper.areaPaths(paths)) / AREA_UNITS_PER_M2;
}

function widthM(paths: Paths64): number {
  const b = Clipper.getBoundsPaths(paths);
  return Math.min(Math.abs(b.right - b.left), Math.abs(b.bottom - b.top)) / UNITS_PER_M;
}

/** The plate shrunk by an even inward offset, never outside the original. */
export function insetBy(source: Plate, insetM: number): Plate {
  if (insetM <= 0) return source;
  return intersect(inflate(source.paths, insetM), source.paths);
}

/**
 * The one way a floor plate is cut, shared by generated and edited designs: `base` (raw paths
 * of an allowed region, or a plate) shrunk by `insetM`, then kept inside the floor below.
 */
export function cutPlate(base: Paths64 | Plate, insetM: number, below: Plate | null): Plate {
  const paths = Array.isArray(base) ? base : base.paths;
  if (insetM > 0) {
    const shrunk = insetBy(Array.isArray(base) ? largestPiece(base) : base, insetM);
    return below ? intersect(shrunk.paths, below.paths) : shrunk;
  }
  if (below) return intersect(paths, below.paths);
  return Array.isArray(base) ? largestPiece(base) : base;
}

export type Inset = { plate: Plate; insetM: number };

/**
 * The smallest even inset of `basis` (from `fromM` up), kept inside `below`, whose area is at
 * most `targetM2` (within 0.5 m² under it), found by binary search on the distance.
 */
export function insetToArea(
  basis: Plate,
  targetM2: number,
  below: Plate | null = null,
  fromM = 0,
): Inset {
  const at = (insetM: number) => cutPlate(basis, insetM, below);
  const start = at(fromM);
  if (start.areaM2 <= targetM2) return { plate: start, insetM: fromM };
  if (targetM2 <= 0) return { plate: EMPTY_PLATE, insetM: widthM(basis.paths) / 2 };
  const measure = (insetM: number) =>
    below ? at(insetM).areaM2 : areaOf(inflate(basis.paths, insetM));
  let lo = fromM;
  let hi = Math.max(fromM, widthM(basis.paths) / 2);
  for (let step = 0; step < SEARCH_STEPS; step++) {
    const mid = (lo + hi) / 2;
    const area = measure(mid);
    if (area > targetM2) {
      lo = mid;
    } else {
      hi = mid;
      if (area >= targetM2 - AREA_TOLERANCE_M2) break;
    }
  }
  return { plate: at(hi), insetM: hi };
}

/** A point deep inside the plate: the centre of what is left after the deepest inward offset. */
export function deepestPoint(source: Plate): XY {
  let lo = 0;
  let hi = widthM(source.paths) / 2;
  let core = source.paths;
  for (let step = 0; step < DEEPEST_STEPS; step++) {
    const mid = (lo + hi) / 2;
    const shrunk = inflate(source.paths, mid);
    if (areaOf(shrunk) > 0.01) {
      lo = mid;
      core = shrunk;
    } else {
      hi = mid;
    }
  }
  const outer = largestPiece(core).paths[0] ?? [];
  return centroid(outer);
}

function centroid(path: Path64): XY {
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i] as Path64[number];
    const q = path[(i + 1) % path.length] as Path64[number];
    const cross = p.x * q.y - q.x * p.y;
    a2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (a2 === 0) {
    const n = Math.max(1, path.length);
    return {
      x: path.reduce((s, p) => s + p.x, 0) / n / UNITS_PER_M,
      y: path.reduce((s, p) => s + p.y, 0) / n / UNITS_PER_M,
    };
  }
  return { x: cx / (3 * a2) / UNITS_PER_M, y: cy / (3 * a2) / UNITS_PER_M };
}

/** A rectangle `lengthM` along `direction` (a unit vector) by `depthM`, centred on `centre`. */
export function rectangle(centre: XY, direction: XY, lengthM: number, depthM: number): Paths64 {
  const u = { x: (direction.x * lengthM) / 2, y: (direction.y * lengthM) / 2 };
  const v = { x: (-direction.y * depthM) / 2, y: (direction.x * depthM) / 2 };
  const corners = [
    { x: centre.x - u.x - v.x, y: centre.y - u.y - v.y },
    { x: centre.x + u.x - v.x, y: centre.y + u.y - v.y },
    { x: centre.x + u.x + v.x, y: centre.y + u.y + v.y },
    { x: centre.x - u.x + v.x, y: centre.y - u.y + v.y },
  ];
  return [
    corners.map((p) => ({ x: Math.round(p.x * UNITS_PER_M), y: Math.round(p.y * UNITS_PER_M) })),
  ];
}

export function ringPaths(ring: readonly XY[]): Paths64 {
  return [
    ring.map((p) => ({ x: Math.round(p.x * UNITS_PER_M), y: Math.round(p.y * UNITS_PER_M) })),
  ];
}

/** Unit vector `rotationDeg` clockwise from east (x east, y north). */
export function directionOf(rotationDeg: number): XY {
  const t = (rotationDeg * Math.PI) / 180;
  return { x: Math.cos(t), y: -Math.sin(t) };
}

/** The clockwise-from-east angle of a direction, in (-180, 180]. */
export function rotationOf(direction: XY): number {
  const deg = (-Math.atan2(direction.y, direction.x) * 180) / Math.PI;
  return deg <= -180 ? deg + 360 : deg;
}

/** Area of `a` lying outside `b`, in m². */
export function areaOutsideM2(a: Paths64, b: Paths64): number {
  if (a.length === 0) return 0;
  return areaOf(Clipper.difference(a, b, FillRule.NonZero));
}

export function toPolygon(source: Plate, projection: Projection): Polygon {
  return source.paths.map((path) =>
    closeRing(path.map((p) => projection.toLngLat({ x: p.x / UNITS_PER_M, y: p.y / UNITS_PER_M }))),
  );
}
