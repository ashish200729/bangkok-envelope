import { ALL_RULES_ON, type EngineInput, type PlotEdge, type Road } from "./inputs";
import type { EngineResult, EngineSuccess, Envelope } from "./outputs";
import { makeProjection, type XY } from "./projection";

/** Near Asok; test plots are drawn in metres around it. */
export const TEST_ORIGIN = [100.5602, 13.7385] as const;
const projection = makeProjection(TEST_ORIGIN);

export type Side = "boundary" | number;

/**
 * Builds an input from local-metre corners. `sides[i]` is the side from corner i to i + 1:
 * "boundary", or a road width in metres (each road side gets its own road).
 */
export function plotInput(
  corners: readonly (readonly [number, number])[],
  sides: readonly Side[],
  overrides: Partial<EngineInput> = {},
): EngineInput {
  const roads: Road[] = [];
  const edges: PlotEdge[] = sides.map((side, i) => {
    if (side === "boundary") return { kind: "boundary" };
    const id = `road-${i}`;
    roads.push({ id, name: `Road ${i}`, widthM: side, widthSource: "user" });
    return { kind: "road", roadId: id };
  });
  return {
    plot: {
      vertices: corners.map(([x, y]) => projection.toLngLat({ x, y })),
      edges,
    },
    roads,
    zone: "Y10",
    buildingType: "condo",
    farBonusPct: 0,
    site: { stationDistanceM: null },
    toggles: ALL_RULES_ON,
    ...overrides,
  };
}

export function rect(width: number, depth: number): [number, number][] {
  return [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth],
  ];
}

export function success(result: EngineResult): EngineSuccess {
  if (!result.ok)
    throw new Error(`Expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

/** Area of the slice covering height z, or 0 above the envelope. */
export function areaAt(envelope: Envelope | null, z: number): number {
  const slice = envelope?.slices.find((s) => s.z0M <= z && z < s.z1M);
  return slice?.areaM2 ?? 0;
}

export function footprintPoints(envelope: Envelope): XY[][] {
  return envelope.slices.map((slice) =>
    slice.footprint.flatMap((polygon) =>
      polygon.flatMap((ring) => ring.map((position) => projection.toLocal(position))),
    ),
  );
}

/** Deterministic PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { projection as testProjection };
