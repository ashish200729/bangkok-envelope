import type { SiteAnalysis } from "../evaluate";
import { formatNumber } from "../format";
import type { BuildingType, EngineInput } from "../inputs";
import type { Design, DesignId, FloorUse } from "../outputs";
import { farLimit, LAW, openSpaceMin, sizeCapForUse, ZONE_RULES } from "../rules-data";
import type { EnvelopeKind } from "../setbacks";
import { DESIGN_ASSUMPTIONS, defaultUnitSizeM2, floorHeightM, MAIN_USE } from "./assumptions";
import { measureDesign } from "./measure";
import { midRiseScheme } from "./mid-rise";
import { bestLayout, type Layout, type Limits } from "./program";
import { specOf } from "./recipe";
import { PlateCache, type Scheme, type SliceSet } from "./stack";
import { steppedScheme } from "./stepped";
import { roadDirection, siteAnchor, towerScheme } from "./tower";

export { buildCustomDesign, customDesign } from "./custom";
export { defaultFloorSpec, defaultTowerSpec, describeSpecChange, USE_LABEL } from "./studio";

const USE_NOUN = { condo: "condo", office: "office", hotel: "hotel" } as const satisfies Record<
  BuildingType,
  string
>;

const NAMES = {
  midrise: "Mid-rise",
  "podium-tower": "Podium + tower",
  stepped: "Stepped",
} as const satisfies Record<DesignId, string>;

/** Caps on total floor area, footprint and main use for a low-rise or a high-rise on this site. */
export function limitsFor(input: EngineInput, site: SiteAnalysis, highRise: boolean): Limits {
  const { zone, toggles, buildingType } = input;
  const plot = site.plot.areaM2;
  const largeRoad = site.frontages.some(
    (f) =>
      f.road.widthM >= LAW.highRiseLargeRoadM.value &&
      f.frontageM >= LAW.highRiseMinFrontageM.value - 0.01,
  );
  const roadCap =
    highRise && toggles.highRiseGate && !largeRoad
      ? LAW.highRiseLargeGfaM2
      : Number.POSITIVE_INFINITY;
  const gfaM2 = Math.min(farLimit(zone, input.farBonusPct, highRise) * plot, roadCap);
  const osrMin = toggles.openSpace ? ZONE_RULES[zone].osrMin.value : null;
  const widest = Math.max(0, ...site.frontages.map((f) => f.road.widthM));
  const size = sizeCapForUse(zone, buildingType, widest, input.site.stationDistanceM);
  const useAreaM2 =
    size.kind === "none"
      ? Number.POSITIVE_INFINITY
      : size.unit === "m2"
        ? size.max
        : size.max * DESIGN_ASSUMPTIONS.hotelM2PerKey.value;
  return {
    plotAreaM2: plot,
    gfaM2,
    osrMin,
    groundCapsM2: groundCaps(plot, gfaM2, osrMin, openSpaceMin(buildingType).value),
    useAreaM2,
  };
}

/**
 * The open-ground cap first; when OSR (open ground ÷ total floor area) would bind before FAR,
 * smaller footprints that leave room for the full floor area are tried too.
 */
function groundCaps(plot: number, gfa: number, osrMin: number | null, openShare: number): number[] {
  if (osrMin === null) return [Number.POSITIVE_INFINITY];
  const open = (1 - openShare) * plot;
  const forFullGfa = plot - osrMin * gfa;
  return forFullGfa > 1 && forFullGfa < open - 1
    ? [open, (open + forFullGfa) / 2, forFullGfa]
    : [open];
}

/** Used only to guess the tower's mid-height when choosing where the tower stands. */
const TYPICAL_PODIUM_PARKING_FLOORS = 3;
/** A stepped design within this share of A's floor area, with as many floors, repeats A. */
const SAME_GFA_SHARE = 0.005;

type Planned = { id: DesignId; envelope: EnvelopeKind; set: SliceSet; layout: Layout };

const fmt = (n: number) => formatNumber(n, 1);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function parts(input: EngineInput, layout: Layout): string {
  const count = (use: FloorUse) => layout.floors.filter((f) => f.use === use).length;
  const list = [
    count("lobby") > 0 ? "a lobby" : null,
    count("parking") > 0 ? plural(count("parking"), "parking floor") : null,
    plural(count(MAIN_USE[input.buildingType]), `${USE_NOUN[input.buildingType]} floor`),
  ].filter((s): s is string => s !== null);
  return list.length > 1
    ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`
    : list.join("");
}

function summary(input: EngineInput, p: Planned, heightM: number): string {
  const floors = p.layout.floors;
  const storeys = floors.length;
  const envelopeName = p.envelope === "lowRise" ? "low-rise" : "high-rise";
  switch (p.id) {
    case "midrise":
      return `A ${storeys}-storey block, ${fmt(heightM)} m tall and under the 23 m high-rise line, with ${parts(input, p.layout)}, every floor the same outline.`;
    case "podium-tower": {
      const tower = floors.filter((f) => f.use === MAIN_USE[input.buildingType]);
      const plate = tower.reduce((s, f) => s + f.plate.areaM2, 0) / Math.max(1, tower.length);
      return `A ${tower.length}-storey ${USE_NOUN[input.buildingType]} tower of about ${formatNumber(plate)} m² floors on a ${storeys - tower.length}-storey podium of lobby and parking, ${fmt(heightM)} m tall.`;
    }
    case "stepped":
      return `${storeys} storeys, ${fmt(heightM)} m tall, with ${parts(input, p.layout)}, each floor as large as the ${envelopeName} envelope allows at its height.`;
  }
}

function toDesign(input: EngineInput, site: SiteAnalysis, p: Planned): Design {
  const unitSizeM2 = defaultUnitSizeM2(input.buildingType);
  const floors = p.layout.floors;
  const measured = measureDesign(input, site, {
    envelope: p.envelope,
    set: p.set,
    floors,
    unitSizeM2,
  });
  const spec = specOf({
    name: NAMES[p.id],
    envelope: p.envelope,
    set: p.set,
    straight: p.id === "midrise",
    floors,
    buildingType: input.buildingType,
  });
  return {
    id: p.id,
    name: NAMES[p.id],
    summary: summary(input, p, measured.heightM),
    spec,
    ...measured,
  };
}

const gfaOf = (layout: Layout) => layout.floors.reduce((s, f) => s + f.plate.areaM2, 0);
const topOf = (layout: Layout) => {
  const last = layout.floors[layout.floors.length - 1];
  return last ? last.z0M + last.heightM : 0;
};

/**
 * A: a mid-rise block under 23 m. B: a podium and tower in the high-rise envelope, built even when
 * the site fails the access test so its checklist can show why. C: a stepped massing in whichever
 * allowed envelope holds more floor area; left out when it repeats A and B exists.
 */
export function buildDesigns(input: EngineInput, site: SiteAnalysis): Design[] {
  const type = input.buildingType;
  const use = MAIN_USE[type];
  const height = floorHeightM(type);
  const lowSet: SliceSet = { slices: site.lowRise, topBelowM: LAW.highRiseThresholdM.value };
  const lowCache = new PlateCache(lowSet);
  const lowLimits = limitsFor(input, site, false);
  const highSet: SliceSet | null = site.highRiseGeometry
    ? { slices: site.highRiseGeometry, topBelowM: null }
    : null;
  const highCache = highSet ? new PlateCache(highSet) : null;
  const highLimits = limitsFor(input, site, true);

  const plan = (
    id: DesignId,
    envelope: EnvelopeKind,
    set: SliceSet,
    scheme: Scheme,
    limits: Limits,
  ): Planned | null => {
    const layout = bestLayout(scheme, limits, type);
    return layout ? { id, envelope, set, layout } : null;
  };

  const a = plan("midrise", "lowRise", lowSet, midRiseScheme(lowCache, use, height), lowLimits);

  let b: Planned | null = null;
  if (highSet && highCache) {
    const assumed = DESIGN_ASSUMPTIONS;
    const targetM2 = assumed.towerPlateM2.value[type];
    const podiumM =
      assumed.lobbyHeightM.value +
      TYPICAL_PODIUM_PARKING_FLOORS * assumed.parkingFloorHeightM.value;
    const towerFloors = Math.min(highLimits.gfaM2, highLimits.useAreaM2) / targetM2;
    const scheme = towerScheme({
      cache: highCache,
      use,
      useHeightM: height,
      direction: roadDirection(site),
      targetM2,
      midHeightM: podiumM + (towerFloors / 2) * height,
      anchor: siteAnchor(site.lowRise),
    });
    const tower = plan("podium-tower", "highRise", highSet, scheme, highLimits);
    if (tower && topOf(tower.layout) >= LAW.highRiseThresholdM.value) b = tower;
  }

  const steppedOptions = [
    plan("stepped", "lowRise", lowSet, steppedScheme(lowCache, use, height), lowLimits),
    site.highRise.allowed && highSet && highCache
      ? plan("stepped", "highRise", highSet, steppedScheme(highCache, use, height), highLimits)
      : null,
  ].filter((p): p is Planned => p !== null);
  let c: Planned | null = null;
  for (const option of steppedOptions) {
    if (!c || gfaOf(option.layout) > gfaOf(c.layout) + 0.5) c = option;
  }
  const repeatsA =
    a !== null &&
    c !== null &&
    c.layout.floors.length === a.layout.floors.length &&
    Math.abs(gfaOf(c.layout) - gfaOf(a.layout)) <= SAME_GFA_SHARE * gfaOf(a.layout);
  if (b && repeatsA) c = null;

  return [a, b, c].filter((p): p is Planned => p !== null).map((p) => toDesign(input, site, p));
}
