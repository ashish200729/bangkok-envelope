import {
  BUILDING_TYPE_INFO,
  type Check,
  type CheckStatus,
  type Design,
  type DesignId,
  type EngineInput,
  type EngineSuccess,
  type Envelope,
  type EnvelopeSlice,
  type Floor,
  type FloorUse,
  farLimit,
  LAW,
  type LngLat,
  type MultiPolygon,
  openSpaceMin,
  type Polygon,
  ZONE_RULES,
} from "@envelope/engine";

/**
 * Hand-made concept designs built from a real result's envelopes, for unit tests of the designs
 * UI helpers independent of the engine's generator. They respect the envelope and FAR, but the
 * massing is a plain scale of each slice, not a real design. Never shown in the app.
 */

const MAIN_USE = { condo: "residential", office: "office", hotel: "hotel" } as const;
const FLOOR_HEIGHT: Record<FloorUse, number> = {
  parking: 3,
  lobby: 4.5,
  retail: 4.5,
  amenity: 4,
  residential: 3,
  office: 3.8,
  hotel: 3.2,
};
const PARKING_M2_PER_SPACE = 30;
const TOWER_PLATE_M2 = 1100;

type Plan = { use: FloorUse; scale: number };

function scaleRing(ring: readonly LngLat[], [cx, cy]: LngLat, k: number): LngLat[] {
  return ring.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as const);
}

function scaleFootprint(
  footprint: MultiPolygon,
  centre: LngLat,
  k: number,
): Polygon | MultiPolygon {
  const parts = footprint.map((polygon) => polygon.map((ring) => scaleRing(ring, centre, k)));
  return parts.length === 1 && parts[0] ? parts[0] : parts;
}

function sliceAt(envelope: Envelope, z: number): EnvelopeSlice | undefined {
  return envelope.slices.find((slice) => slice.z0M <= z && z < slice.z1M);
}

function centreOf(vertices: readonly LngLat[]): LngLat {
  const n = vertices.length;
  return [vertices.reduce((s, v) => s + v[0], 0) / n, vertices.reduce((s, v) => s + v[1], 0) / n];
}

/** Stacks floors from `plans` while each fits the envelope and the floor area cap. */
function stack(
  envelope: Envelope,
  plans: (level: number) => Plan | null,
  centre: LngLat,
  maxGfaM2: number,
): Floor[] {
  const floors: Floor[] = [];
  let z = 0;
  let gfa = 0;
  for (let level = 0; ; level++) {
    const plan = plans(level);
    if (!plan) break;
    const heightM = FLOOR_HEIGHT[plan.use];
    // A floor must fit the strictest slice it touches, which is the one at its top.
    const slice = sliceAt(envelope, z + heightM - 0.001);
    if (!slice || z + heightM > envelope.maxHeightM) break;
    const areaM2 = slice.areaM2 * plan.scale ** 2;
    if (gfa + areaM2 > maxGfaM2) break;
    floors.push({
      level,
      z0M: z,
      heightM,
      use: plan.use,
      outline: scaleFootprint(slice.footprint, centre, plan.scale) as Polygon,
      areaM2,
    });
    z += heightM;
    gfa += areaM2;
  }
  return floors;
}

/**
 * A vertical tower on top of `below`: every floor takes the plate of the slice at the tower's top,
 * the strictest one it passes through (slices only shrink upwards), so the tower never leans.
 */
function tower(
  envelope: Envelope,
  below: readonly Floor[],
  use: FloorUse,
  maxScale: number,
  maxGfaM2: number,
): Floor[] {
  const last = below[below.length - 1];
  const z0 = last ? last.z0M + last.heightM : 0;
  const gfaBelow = below.reduce((s, f) => s + f.areaM2, 0);
  const heightM = FLOOR_HEIGHT[use];
  let best: { count: number; slice: EnvelopeSlice; scale: number } | null = null;
  for (let count = 1; ; count++) {
    const slice = sliceAt(envelope, z0 + count * heightM - 0.001);
    if (!slice) break;
    const scale = Math.min(maxScale, Math.sqrt(TOWER_PLATE_M2 / slice.areaM2));
    if (gfaBelow + count * slice.areaM2 * scale ** 2 > maxGfaM2) break;
    best = { count, slice, scale };
  }
  if (!best) return [];
  const { count, slice, scale } = best;
  const ring = slice.footprint[0]?.[0] ?? [];
  const outline = scaleFootprint(slice.footprint, centreOf(ring.slice(0, -1)), scale);
  return Array.from({ length: count }, (_, i) => ({
    level: below.length + i,
    z0M: z0 + i * heightM,
    heightM,
    use,
    outline: outline as Polygon,
    areaM2: slice.areaM2 * scale ** 2,
  }));
}

function status(ok: boolean, enabled = true): CheckStatus {
  if (!enabled) return "n/a";
  return ok ? "pass" : "fail";
}

const pct = (f: number) => `${Math.round(f * 1000) / 10}%`;
const n = (v: number) => Math.round(v).toLocaleString("en-US");

function finish(
  id: DesignId,
  name: string,
  summary: string,
  floors: Floor[],
  input: EngineInput,
  result: EngineSuccess,
  extraChecks: Check[],
): Design {
  const plot = result.plotAreaM2;
  const gfaM2 = floors.reduce((s, f) => s + f.areaM2, 0);
  const top = floors[floors.length - 1];
  const heightM = top ? top.z0M + top.heightM : 0;
  const footprintM2 = floors[0]?.areaM2 ?? 0;
  const openSpaceM2 = plot - footprintM2;
  const main = MAIN_USE[input.buildingType];
  const useAreaM2 = floors.filter((f) => f.use === main).reduce((s, f) => s + f.areaM2, 0);
  const keyCount =
    input.buildingType === "condo"
      ? Math.floor((useAreaM2 * 0.78) / 55)
      : input.buildingType === "hotel"
        ? Math.floor((useAreaM2 * 0.65) / 34)
        : null;
  const parkingArea = floors.filter((f) => f.use === "parking").reduce((s, f) => s + f.areaM2, 0);
  const providedSpaces = Math.floor(parkingArea / PARKING_M2_PER_SPACE);
  const requiredSpaces = Math.max(
    Math.ceil(gfaM2 / 120),
    input.buildingType === "condo" ? Math.round((keyCount ?? 0) * 0.4) : 0,
  );
  const highRise = heightM >= LAW.highRiseThresholdM.value;
  const far = farLimit(input.zone, input.farBonusPct, highRise);
  const farUsed = gfaM2 / plot;
  const osrUsed = gfaM2 > 0 ? openSpaceM2 / gfaM2 : 0;
  const openMin = openSpaceMin(input.buildingType);
  const osrMin = ZONE_RULES[input.zone].osrMin;
  const typeName = BUILDING_TYPE_INFO[input.buildingType].name.toLowerCase();
  const openOn = input.toggles.openSpace;

  const checks: Check[] = [
    {
      ruleId: "far.max",
      label: "Floor area ratio",
      status: status(farUsed <= far + 1e-9),
      actual: farUsed,
      limit: far,
      unit: "ratio",
      source: ZONE_RULES[input.zone].farMax.source,
      message: `${n(gfaM2)} m² of floor area is ${Math.round(farUsed * 100) / 100}× the plot; the limit is ${Math.round(far * 100) / 100}×`,
    },
    {
      ruleId: "openSpace.min",
      label: "Open ground on the plot",
      status: status(openSpaceM2 / plot >= openMin.value, openOn),
      actual: openSpaceM2 / plot,
      limit: openMin.value,
      unit: "ratio",
      source: openMin.source,
      message: `${pct(openSpaceM2 / plot)} of the plot stays open; a ${typeName} needs ${pct(openMin.value)}`,
    },
    {
      ruleId: "osr.min",
      label: "Open space ratio",
      status: status(osrUsed >= osrMin.value, openOn),
      actual: osrUsed,
      limit: osrMin.value,
      unit: "ratio",
      source: osrMin.source,
      message: `Open ground is ${pct(osrUsed)} of the floor area; the zone needs ${pct(osrMin.value)}`,
    },
    ...extraChecks,
    {
      ruleId: "parking.min",
      label: "Parking spaces",
      status: providedSpaces >= requiredSpaces ? "pass" : "warn",
      actual: providedSpaces,
      limit: requiredSpaces,
      unit: "spaces",
      source: LAW.parking.source,
      message: `${n(providedSpaces)} spaces on the parking floors; about ${n(requiredSpaces)} required`,
    },
  ];

  return {
    id,
    name,
    summary,
    envelope: highRise ? "highRise" : "lowRise",
    floors,
    heightM,
    gfaM2,
    farUsed,
    footprintM2,
    openSpaceM2,
    osrUsed,
    useAreaM2,
    keyCount,
    parking: { requiredSpaces, providedSpaces },
    checks,
    passes: checks.every((c) => c.status !== "fail"),
  };
}

function lowRiseCheck(heightM: number): Check {
  const limit = LAW.highRiseThresholdM.value;
  return {
    ruleId: "highRise.threshold",
    label: "High-rise threshold",
    status: heightM < limit ? "pass" : "fail",
    actual: heightM,
    limit,
    unit: "m",
    source: LAW.highRiseThresholdM.source,
    message: `${Math.round(heightM * 10) / 10} m tall, under ${limit} m, so the high-rise rules do not apply`,
  };
}

/** Concept designs for a result: mid-rise and stepped in the low-rise envelope, a tower when allowed. */
export function fixtureDesigns(result: EngineSuccess, input: EngineInput): Design[] {
  const centre = centreOf(input.plot.vertices);
  const main = MAIN_USE[input.buildingType];
  const plot = result.plotAreaM2;
  const coverMax = (1 - openSpaceMin(input.buildingType).value) * 0.95;
  const { lowRise, highRise } = result.envelopes;
  const fitScale = (envelope: Envelope) =>
    Math.sqrt(Math.min(1, (coverMax * plot) / Math.max(1, envelope.groundAreaM2)));

  const designs: Design[] = [];
  const lowCap = farLimit(input.zone, input.farBonusPct, false) * plot;
  const k = fitScale(lowRise);
  const podium = (level: number): FloorUse => (level === 0 ? "lobby" : "parking");

  const midFloors = stack(
    lowRise,
    (level) => ({ use: level < 3 ? podium(level) : main, scale: k }),
    centre,
    lowCap,
  );
  designs.push(
    finish(
      "midrise",
      "A · Mid-rise",
      "Stays under 23 m, so none of the high-rise rules apply. Fills the low-rise envelope with a lobby, two parking floors and the main use above.",
      midFloors,
      input,
      result,
      [lowRiseCheck(midFloors.reduce((h, f) => h + f.heightM, 0))],
    ),
  );

  if (highRise) {
    const cap = Math.min(
      farLimit(input.zone, input.farBonusPct, true) * plot,
      result.highRise.maxGfaM2 ?? Infinity,
    );
    const kp = fitScale(highRise);
    const base = stack(
      highRise,
      (level) => (level < 4 ? { use: podium(level), scale: kp } : null),
      centre,
      cap,
    );
    const towerFloors = [...base, ...tower(highRise, base, main, kp, cap)];
    designs.push(
      finish(
        "podium-tower",
        "B · Podium and tower",
        "A four-storey podium with lobby and parking, and a slender tower that uses as much of the floor area ratio as the high-rise envelope allows.",
        towerFloors,
        input,
        result,
        [...result.highRise.checks],
      ),
    );
  }

  const stepped = stack(
    lowRise,
    (level) => ({ use: level < 2 ? podium(level) : main, scale: level < 3 ? k : k * 0.82 }),
    centre,
    lowCap * 0.8,
  );
  designs.push(
    finish(
      "stepped",
      "C · Stepped terraces",
      "A low-rise that steps back above the third floor, leaving terraces and more daylight for neighbours at the cost of some floor area.",
      stepped,
      input,
      result,
      [lowRiseCheck(stepped.reduce((h, f) => h + f.heightM, 0))],
    ),
  );
  return designs;
}
