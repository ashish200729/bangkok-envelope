import type { RuleToggles } from "./inputs";
import type { EdgeSide, LocalEdge } from "./plot";
import { boundaryDistanceM, LAW, roadPlaneDistanceM, roadSetbackM } from "./rules-data";

export type EnvelopeKind = "lowRise" | "highRise";

type DistanceRule = (side: EdgeSide, heightM: number, toggles: RuleToggles) => number;

const clearance = LAW.highRiseClearanceM.value;

const roadPlane: DistanceRule = (side, z, t) =>
  side.kind === "road" && t.roadHeightPlane ? roadPlaneDistanceM(z, side.road.widthM) : 0;

/**
 * Each envelope's distance rules; a side keeps the largest that applies. The high-rise 6 m
 * clearance belongs to the setback toggles: on a road side it follows `roadSetback`, on a
 * neighbour side `boundarySetback`.
 */
const DISTANCE_RULES: Record<EnvelopeKind, readonly DistanceRule[]> = {
  lowRise: [
    (side, _z, t) => (side.kind === "road" && t.roadSetback ? roadSetbackM(side.road.widthM) : 0),
    (side, z, t) => (side.kind === "boundary" && t.boundarySetback ? boundaryDistanceM(z) : 0),
    roadPlane,
  ],
  highRise: [
    (side, _z, t) =>
      side.kind === "road" && t.roadSetback
        ? Math.max(roadSetbackM(side.road.widthM), clearance)
        : 0,
    (side, _z, t) => (side.kind === "boundary" && t.boundarySetback ? clearance : 0),
    roadPlane,
  ],
};

/**
 * How far each side's cut reaches for a building part at height z, in metres. A slice valid for
 * z0 ≤ z < z1 uses z1: every distance grows with height, so the top of the band is the strictest.
 */
export function edgeDistances(
  edges: readonly LocalEdge[],
  kind: EnvelopeKind,
  heightM: number,
  toggles: RuleToggles,
): number[] {
  const rules = DISTANCE_RULES[kind];
  return edges.map((edge) =>
    Math.max(0, ...rules.map((rule) => rule(edge.side, heightM, toggles))),
  );
}
