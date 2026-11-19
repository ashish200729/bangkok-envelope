import { formatNumber } from "../format";
import type { RoadFrontage } from "../high-rise";
import { BUILDING_TYPE_INFO, type EngineInput, ZONES } from "../inputs";
import type { Citation } from "../law";
import type { Check, CheckStatus } from "../outputs";
import { RULE_INFO, type RuleId } from "../rules";
import { farLimit, LAW, openSpaceMin, sizeCapForUse, ZONE_RULES } from "../rules-data";
import type { EnvelopeKind } from "../setbacks";
import { areaOutsideM2 } from "./plates";
import type { PlannedFloor, SliceSet } from "./stack";

/** Below this much floor area outside the envelope, the difference is Clipper rounding. */
const OUTSIDE_TOLERANCE_M2 = 0.05;
const EPS = 1e-9;

/** EIA screening sizes for buildings (MNRE notification, annex). */
export const EIA_RULES = {
  source: { law: "eia", clause: "annex" } satisfies Citation,
  lodging: { keys: 80, areaM2: 4_000 },
  other: { heightM: 23, areaM2: 10_000 },
} as const;

export type MeasuredDesign = {
  envelope: EnvelopeKind;
  set: SliceSet;
  floors: readonly PlannedFloor[];
  heightM: number;
  gfaM2: number;
  farUsed: number;
  openSpaceM2: number;
  osrUsed: number;
  useAreaM2: number;
  keyCount: number | null;
  parking: { requiredSpaces: number; providedSpaces: number };
};

export type CheckSite = {
  input: EngineInput;
  plotAreaM2: number;
  frontages: readonly RoadFrontage[];
  /** The site's own high-rise access checks (road width, frontage). */
  accessChecks: readonly Check[];
};

const int = (n: number) => formatNumber(n);
const dec = (n: number) => formatNumber(n, 2);
const pct = (n: number) => `${formatNumber(n * 100, 1)}%`;

function check(
  ruleId: RuleId,
  status: CheckStatus,
  actual: number | null,
  limit: number | null,
  source: Citation,
  message: string,
): Check {
  const { label, unit } = RULE_INFO[ruleId];
  return { ruleId, label, status, actual, limit, unit, source, message };
}

function switchedOff(
  ruleId: RuleId,
  actual: number | null,
  limit: number | null,
  source: Citation,
) {
  return check(ruleId, "n/a", actual, limit, source, "Switched off");
}

const passIf = (ok: boolean): CheckStatus => (ok ? "pass" : "fail");

/** Floor area outside the envelope, worst slice per floor, measured against every slice a floor spans. */
export function areaOutsideEnvelopeM2(set: SliceSet, floors: readonly PlannedFloor[]): number {
  let outside = 0;
  for (const floor of floors) {
    const top = floor.z0M + floor.heightM;
    const overTop =
      (set.topBelowM !== null && top >= set.topBelowM - 1e-6) ||
      top > (set.slices[set.slices.length - 1]?.z1M ?? 0) + 1e-6;
    if (overTop) {
      outside += floor.plate.areaM2;
      continue;
    }
    let worst = 0;
    for (const slice of set.slices) {
      if (slice.z1M <= floor.z0M + 1e-6 || slice.z0M >= top - 1e-6) continue;
      worst = Math.max(worst, areaOutsideM2(floor.plate.paths, slice.region.paths));
    }
    outside += worst;
  }
  return outside;
}

export function designChecks(site: CheckSite, d: MeasuredDesign): Check[] {
  const { input } = site;
  const { zone, toggles, buildingType } = input;
  const zoneLabel = ZONES[zone].labelTh;
  const typeName = BUILDING_TYPE_INFO[buildingType].name.toLowerCase();
  const threshold = LAW.highRiseThresholdM.value;
  const highRise = d.heightM >= threshold;
  const zoneRules = ZONE_RULES[zone];
  const checks: Check[] = [];

  const far = farLimit(zone, input.farBonusPct, false);
  checks.push(
    check(
      "far.max",
      passIf(d.farUsed <= far + EPS),
      d.farUsed,
      far,
      input.farBonusPct > 0 ? LAW.farBonusMaxPct.source : zoneRules.farMax.source,
      `Uses FAR ${dec(d.farUsed)} (${int(d.gfaM2)} m²); ${zoneLabel} allows ${dec(far)}${input.farBonusPct > 0 ? ` with the ${dec(input.farBonusPct)}% bonus` : ""}`,
    ),
  );
  if (highRise) {
    const ceiling = LAW.highRiseFarCeiling.value;
    checks.push(
      check(
        "highRise.farCeiling",
        passIf(d.farUsed <= ceiling + EPS),
        d.farUsed,
        ceiling,
        LAW.highRiseFarCeiling.source,
        `A high-rise may use FAR ${ceiling} at most; this one uses ${dec(d.farUsed)}`,
      ),
    );
  }

  const osrMin = zoneRules.osrMin.value;
  checks.push(
    toggles.openSpace
      ? check(
          "osr.min",
          passIf(d.osrUsed >= osrMin - EPS),
          d.osrUsed,
          osrMin,
          zoneRules.osrMin.source,
          `Open ground is ${pct(d.osrUsed)} of the total floor area; ${zoneLabel} needs at least ${pct(osrMin)}`,
        )
      : switchedOff("osr.min", d.osrUsed, osrMin, zoneRules.osrMin.source),
  );
  const open = openSpaceMin(buildingType);
  const openShare = d.openSpaceM2 / site.plotAreaM2;
  checks.push(
    toggles.openSpace
      ? check(
          "openSpace.min",
          passIf(openShare >= open.value - EPS),
          openShare,
          open.value,
          open.source,
          `${pct(openShare)} of the plot stays open ground; a ${typeName} needs at least ${pct(open.value)}`,
        )
      : switchedOff("openSpace.min", openShare, open.value, open.source),
  );

  const outside = areaOutsideEnvelopeM2(d.set, d.floors);
  const envelopeName = d.envelope === "lowRise" ? "low-rise" : "high-rise";
  checks.push(
    check(
      "envelope.fit",
      passIf(outside < OUTSIDE_TOLERANCE_M2),
      Math.round(outside * 100) / 100,
      0,
      d.envelope === "lowRise"
        ? { law: "bma-2544", clause: "49, 50, 54" }
        : LAW.highRiseClearanceM.source,
      outside < OUTSIDE_TOLERANCE_M2
        ? `Every floor stays inside the ${envelopeName} envelope: road setback, distance to neighbours and road height plane`
        : `${dec(outside)} m² of floor area lies outside the ${envelopeName} envelope`,
    ),
  );

  if (highRise) checks.push(...highRiseAccess(site, d));
  else {
    checks.push(
      check(
        "highRise.threshold",
        "pass",
        d.heightM,
        threshold,
        LAW.highRiseThresholdM.source,
        `At ${dec(d.heightM)} m the building stays below ${threshold} m, so the high-rise rules do not apply`,
      ),
    );
  }

  checks.push(sizeCheck(site, d), parkingCheck(d), eiaCheck(site, d));
  return checks;
}

function highRiseAccess(site: CheckSite, d: MeasuredDesign): Check[] {
  const gate = site.input.toggles.highRiseGate;
  const access = site.accessChecks
    .filter((c) => c.ruleId === "highRise.road" || c.ruleId === "highRise.frontage")
    .map((c) => (gate ? c : switchedOff(c.ruleId, c.actual, c.limit, c.source)));
  const largeGfa = LAW.highRiseLargeGfaM2;
  const minFrontage = LAW.highRiseMinFrontageM.value - 0.01;
  const widest = Math.max(
    0,
    ...site.frontages.filter((f) => f.frontageM >= minFrontage).map((f) => f.road.widthM),
  );
  const needed = LAW.highRiseLargeRoadM.value;
  const source = LAW.highRiseLargeRoadM.source;
  const large = !gate
    ? switchedOff("highRise.largeRoad", widest, needed, source)
    : d.gfaM2 <= largeGfa
      ? check(
          "highRise.largeRoad",
          "pass",
          widest,
          null,
          source,
          `Total floor area is ${int(d.gfaM2)} m², not over ${int(largeGfa)} m², so an ${needed} m road is not needed`,
        )
      : check(
          "highRise.largeRoad",
          passIf(widest >= needed),
          widest,
          needed,
          source,
          `Total floor area is over ${int(largeGfa)} m², so the road must be at least ${needed} m wide; the widest is ${dec(widest)} m`,
        );
  return [...access, large];
}

function sizeCheck(site: CheckSite, d: MeasuredDesign): Check {
  const { zone, buildingType, site: siteInput } = site.input;
  const widest = Math.max(0, ...site.frontages.map((f) => f.road.widthM));
  const limit = sizeCapForUse(zone, buildingType, widest, siteInput.stationDistanceM);
  const hotel = buildingType === "hotel";
  const ruleId: RuleId = hotel ? "use.rooms" : "use.size";
  const actual = hotel ? (d.keyCount ?? 0) : d.useAreaM2;
  const zoneLabel = ZONES[zone].labelTh;
  if (buildingType === "condo") {
    return check(
      ruleId,
      "n/a",
      actual,
      null,
      limit.source,
      `${zoneLabel} sets no size cap for a condominium`,
    );
  }
  const what = hotel ? `${int(actual)} rooms` : `${int(actual)} m² of office floor`;
  if (limit.kind === "none") {
    return check(
      ruleId,
      "pass",
      actual,
      null,
      limit.source,
      `${what}; the road width or a station within ${LAW.stationRadiusM} m lifts the size caps in ${zoneLabel}`,
    );
  }
  const unit = limit.unit === "m2" ? "m²" : "rooms";
  return check(
    ruleId,
    passIf(actual <= limit.max + EPS),
    actual,
    limit.max,
    limit.source,
    `${what}; here ${zoneLabel} allows ${int(limit.max)} ${unit}${limit.blockedBy.needsRoadM === null ? "" : ` without a ${limit.blockedBy.needsRoadM} m road or a station within ${LAW.stationRadiusM} m`}`,
  );
}

function parkingCheck(d: MeasuredDesign): Check {
  const { requiredSpaces, providedSpaces } = d.parking;
  return check(
    "parking.min",
    passIf(providedSpaces >= requiredSpaces),
    providedSpaces,
    requiredSpaces,
    LAW.parking.source,
    providedSpaces >= requiredSpaces
      ? `${int(providedSpaces)} spaces provided; the law asks for ${int(requiredSpaces)}`
      : `Only ${int(providedSpaces)} spaces fit; the law asks for ${int(requiredSpaces)}`,
  );
}

function eiaCheck(site: CheckSite, d: MeasuredDesign): Check {
  const lodging = site.input.buildingType !== "office";
  const rule = lodging ? EIA_RULES.lodging : EIA_RULES.other;
  const needed = lodging
    ? (d.keyCount ?? 0) >= EIA_RULES.lodging.keys || d.gfaM2 >= rule.areaM2
    : d.heightM >= EIA_RULES.other.heightM || d.gfaM2 >= rule.areaM2;
  const trigger = lodging
    ? `${EIA_RULES.lodging.keys} ${site.input.buildingType === "hotel" ? "rooms" : "units"} or ${int(rule.areaM2)} m²`
    : `${EIA_RULES.other.heightM} m tall or ${int(rule.areaM2)} m²`;
  return check(
    "eia.threshold",
    needed ? "warn" : "pass",
    d.gfaM2,
    rule.areaM2,
    EIA_RULES.source,
    needed
      ? `Needs an environmental impact assessment report (from ${trigger}). This is an approval step before the permit, not a refusal`
      : `Below the EIA sizes (${trigger}), so no environmental impact assessment report is needed`,
  );
}
