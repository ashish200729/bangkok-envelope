import type { LngLat } from "./geo";
import type { Plot, Road } from "./inputs";
import type { EngineErrorCode } from "./outputs";
import { makeProjection, type Projection, ringCentroid, type XY } from "./projection";

export type EdgeSide = { kind: "road"; road: Road } | { kind: "boundary" };

/** A side of the cleaned plot in local metres, interior on its left (the ring is CCW). */
export type LocalEdge = {
  a: XY;
  b: XY;
  lengthM: number;
  side: EdgeSide;
  /** Index of this side in the input's `plot.edges`. */
  inputIndex: number;
};

export type PreparedPlot = {
  projection: Projection;
  /** Open ring, counter-clockwise, no repeated or zero-length sides. */
  vertices: readonly XY[];
  /** edges[i] runs from vertices[i] to vertices[i + 1]. */
  edges: readonly LocalEdge[];
  areaM2: number;
};

export type PlotError = { code: EngineErrorCode; message: string };

export type PreparePlotResult = { ok: true; plot: PreparedPlot } | { ok: false; error: PlotError };

/** Corners closer than this are the same corner. */
const SAME_POINT_M = 0.01;
/** Sides closer than this touch. */
const TOUCH_M = 0.001;
const MIN_AREA_M2 = 1;

type Corner = { p: XY; side: EdgeSide; inputIndex: number };

export function signedArea(ring: readonly XY[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as XY;
    const b = ring[(i + 1) % ring.length] as XY;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function distance(a: XY, b: XY): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function cross(o: XY, a: XY, b: XY): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function segmentsTouch(a: XY, b: XY, c: XY, d: XY): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  return (
    Math.min(
      distanceToSegment(a, c, d),
      distanceToSegment(b, c, d),
      distanceToSegment(c, a, b),
      distanceToSegment(d, a, b),
    ) < TOUCH_M
  );
}

function dropZeroLengthSides(corners: readonly Corner[]): Corner[] {
  return corners.filter((corner, i) => {
    const next = corners[(i + 1) % corners.length] as Corner;
    return distance(corner.p, next.p) >= SAME_POINT_M;
  });
}

function isCollinear(points: readonly XY[]): boolean {
  const first = points[0] as XY;
  let far = first;
  for (const p of points) if (distance(first, p) > distance(first, far)) far = p;
  return points.every((p) => distanceToSegment(p, first, far) < SAME_POINT_M);
}

function selfIntersects(points: readonly XY[]): boolean {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i] as XY;
    const b = points[(i + 1) % n] as XY;
    const c = points[(i + 2) % n] as XY;
    const doublesBack =
      Math.abs(cross(a, b, c)) < TOUCH_M * distance(a, b) &&
      (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0;
    if (doublesBack) return true;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const d = points[j] as XY;
      const e = points[(j + 1) % n] as XY;
      if (segmentsTouch(a, b, d, e)) return true;
    }
  }
  return false;
}

/** Projects, cleans and validates the plot. Shape problems come back as values. */
export function preparePlot(plot: Plot, roads: readonly Road[]): PreparePlotResult {
  const projection = makeProjection(ringCentroid(plot.vertices));
  const roadById = new Map(roads.map((road) => [road.id, road]));
  const raw: Corner[] = plot.vertices.map((position: LngLat, i) => {
    const edge = plot.edges[i];
    const road = edge?.kind === "road" ? roadById.get(edge.roadId) : undefined;
    return {
      p: projection.toLocal(position),
      side: road ? { kind: "road", road } : { kind: "boundary" },
      inputIndex: i,
    };
  });
  let corners = dropZeroLengthSides(raw);
  const points = corners.map((corner) => corner.p);

  if (corners.length < 3 || isCollinear(points)) {
    return failure(
      "degenerate",
      "The plot needs at least three separate corners that enclose an area.",
    );
  }
  if (selfIntersects(points)) {
    return failure(
      "self-intersecting",
      "The plot's sides cross or touch each other. Move a corner so the outline does not cross itself.",
    );
  }
  const area = signedArea(points);
  if (Math.abs(area) < MIN_AREA_M2) {
    return failure(
      "degenerate",
      "The plot has almost no area. Draw it again with corners further apart.",
    );
  }
  if (area < 0) corners = reverseCorners(corners);
  if (!corners.some((corner) => corner.side.kind === "road")) {
    return failure(
      "no-road-edge",
      "No side of the plot faces a public road. Mark the side that fronts the road.",
    );
  }

  const vertices = corners.map((corner) => corner.p);
  const edges = corners.map((corner, i): LocalEdge => {
    const b = vertices[(i + 1) % vertices.length] as XY;
    return {
      a: corner.p,
      b,
      lengthM: distance(corner.p, b),
      side: corner.side,
      inputIndex: corner.inputIndex,
    };
  });
  return { ok: true, plot: { projection, vertices, edges, areaM2: Math.abs(area) } };
}

/** Reverses the ring while keeping each side's label on the same piece of boundary. */
function reverseCorners(corners: readonly Corner[]): Corner[] {
  const n = corners.length;
  return corners.map((_, j) => {
    const vertex = corners[n - 1 - j] as Corner;
    const edgeOwner = corners[(((n - 2 - j) % n) + n) % n] as Corner;
    return { p: vertex.p, side: edgeOwner.side, inputIndex: edgeOwner.inputIndex };
  });
}

function failure(code: EngineErrorCode, message: string): PreparePlotResult {
  return { ok: false, error: { code, message } };
}
