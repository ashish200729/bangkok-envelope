import {
  type EngineInput,
  type MultiPolygon,
  makeProjection,
  ringCentroid,
  type XY,
} from "@envelope/engine";
import { Clipper, FillRule, type PathsD } from "clipper2-ts";
import { ccw, distanceToRing, openRing, pointInRing, signedAreaXY } from "./geometry";
import type { FlatPolygon, Xyz } from "./massing";
import { SCENE_COLORS } from "./materials";

export type Callout = {
  id: string;
  kind: "height" | "road" | "setback";
  /** Where the label is anchored, in [lng, lat, metres above ground]. */
  position: Xyz;
  text: string;
};

/** A setback narrower than this is not worth a band or a label. */
const MIN_SETBACK_M = 0.3;

/** "6 m", "2.5 m", "1.2 m": whole metres when the value is within 5 cm of one. */
export function formatMetres(value: number): string {
  const whole = Math.round(value);
  if (Math.abs(value - whole) < 0.05) return `${whole} m`;
  return `${value.toFixed(1)} m`;
}

export type SiteAnnotations = {
  /** Light red bands over the setback along each road side. */
  bands: FlatPolygon[];
  road: Callout[];
  setback: Callout[];
};

/**
 * Road widths on the roads and setback distances on the setback bands. The setback is measured
 * from the middle of each road side to the buildable ground, so it shows what the envelope does,
 * whichever rule set it. One label per road: on its longest side.
 */
export function siteAnnotations(
  input: EngineInput,
  buildable: MultiPolygon | null,
): SiteAnnotations {
  const result: SiteAnnotations = { bands: [], road: [], setback: [] };
  const vertices = input.plot.vertices;
  if (vertices.length < 3) return result;
  const projection = makeProjection(ringCentroid(vertices));
  const local = vertices.map(projection.toLocal);
  // Normals point outward for a counter-clockwise ring; flip them for a clockwise input.
  const sign = signedAreaXY(local) < 0 ? -1 : 1;
  const plot = ccw(local);
  const ground = (buildable ?? [])
    .map((polygon) => ccw(openRing(polygon[0] ?? []).map(projection.toLocal)))
    .filter((ring) => ring.length >= 3);
  const at = (p: XY, z: number): Xyz => {
    const [lng, lat] = projection.toLngLat(p);
    return [lng, lat, z];
  };

  const longestPerRoad = new Map<string, { index: number; length: number }>();
  input.plot.edges.forEach((edge, index) => {
    if (edge.kind !== "road") return;
    const a = local[index] as XY;
    const b = local[(index + 1) % local.length] as XY;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const best = longestPerRoad.get(edge.roadId);
    if (!best || length > best.length) longestPerRoad.set(edge.roadId, { index, length });
  });

  input.plot.edges.forEach((edge, index) => {
    if (edge.kind !== "road") return;
    const road = input.roads.find((r) => r.id === edge.roadId);
    const a = local[index] as XY;
    const b = local[(index + 1) % local.length] as XY;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!road || length < 1e-6) return;
    const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    const outward = { x: dir.y * sign, y: -dir.x * sign };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const labelled = longestPerRoad.get(edge.roadId)?.index === index;

    if (labelled) {
      result.road.push({
        id: `road-${road.id}`,
        kind: "road",
        position: at(
          { x: mid.x + outward.x * (road.widthM / 2), y: mid.y + outward.y * (road.widthM / 2) },
          0,
        ),
        text: `${formatMetres(road.widthM)} road`,
      });
    }

    if (ground.length === 0 || ground.some((g) => pointInRing(mid, g))) return;
    const depth = Math.min(...ground.map((g) => distanceToRing(mid, g)));
    if (!Number.isFinite(depth) || depth < MIN_SETBACK_M) return;
    const inward = { x: -outward.x * depth, y: -outward.y * depth };
    const quad: PathsD = [
      [a, b, { x: b.x + inward.x, y: b.y + inward.y }, { x: a.x + inward.x, y: a.y + inward.y }],
    ];
    for (const piece of Clipper.intersectD([plot], quad, FillRule.NonZero, 3)) {
      if (piece.length < 3) continue;
      result.bands.push({
        polygon: [[...piece, piece[0] as XY].map((p) => at(p, 0.07))],
        color: SCENE_COLORS.setbackBand,
      });
    }
    if (labelled) {
      result.setback.push({
        id: `setback-${road.id}`,
        kind: "setback",
        position: at({ x: mid.x + inward.x / 2, y: mid.y + inward.y / 2 }, 0.2),
        text: `${formatMetres(depth)} setback`,
      });
    }
  });
  return result;
}
