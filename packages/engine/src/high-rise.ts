import { MIN_SLICE_AREA_M2 } from "./envelope";
import type { Road, RuleToggles } from "./inputs";
import type { Check, CheckStatus, HighRiseAccess } from "./outputs";
import type { LocalEdge } from "./plot";
import { RULE_INFO } from "./rules";
import { LAW } from "./rules-data";

export type RoadFrontage = { road: Road; frontageM: number };

/** Length of plot boundary facing each road; a frontage drawn as several sides adds up. */
export function roadFrontages(edges: readonly LocalEdge[]): RoadFrontage[] {
  const byRoad = new Map<string, RoadFrontage>();
  for (const edge of edges) {
    if (edge.side.kind !== "road") continue;
    const entry = byRoad.get(edge.side.road.id) ?? { road: edge.side.road, frontageM: 0 };
    entry.frontageM += edge.lengthM;
    byRoad.set(edge.side.road.id, entry);
  }
  return [...byRoad.values()];
}

const minRoad = LAW.highRiseMinRoadM.value;
const minFrontage = LAW.highRiseMinFrontageM.value;
const largeRoad = LAW.highRiseLargeRoadM.value;
/** A side drawn at exactly 12 m should not fail on rounding from the map. */
const LENGTH_TOLERANCE_M = 0.01;

function maxBy<T>(items: readonly T[], score: (item: T) => number): T | undefined {
  let best: T | undefined;
  for (const item of items) if (best === undefined || score(item) > score(best)) best = item;
  return best;
}

const fmt = (n: number) => `${Math.round(n * 10) / 10}`;

function check(
  ruleId: Check["ruleId"],
  status: CheckStatus,
  actual: number | null,
  limit: number | null,
  unit: Check["unit"],
  source: Check["source"],
  message: string,
): Check {
  return { ruleId, label: RULE_INFO[ruleId].label, status, actual, limit, unit, source, message };
}

/**
 * MR 33 cl. 2 site access: one public road at least 10 m wide, faced by at least 12 m of the plot
 * (18 m wide above 30,000 m² of floor area); plus whether anything is left at 23 m after the
 * 6 m clearance.
 */
export function assessHighRise(
  frontages: readonly RoadFrontage[],
  areaAt23M2: number,
  toggles: RuleToggles,
): HighRiseAccess {
  const longEnough = (f: RoadFrontage) => f.frontageM >= minFrontage - LENGTH_TOLERANCE_M;
  const wideEnough = (f: RoadFrontage) => f.road.widthM >= minRoad;
  const best = maxBy(
    frontages.filter((f) => wideEnough(f) && longEnough(f)),
    (f) => f.road.widthM,
  );
  const longFronted = frontages.filter(longEnough);
  const roadShown = maxBy(longFronted.length > 0 ? longFronted : frontages, (f) => f.road.widthM);
  const wide = frontages.filter(wideEnough);
  const frontageShown = maxBy(wide.length > 0 ? wide : frontages, (f) => f.frontageM);
  const fits = areaAt23M2 >= MIN_SLICE_AREA_M2;

  const checks: Check[] = [
    check(
      "highRise.road",
      roadShown && wideEnough(roadShown) ? "pass" : "fail",
      roadShown?.road.widthM ?? null,
      minRoad,
      "m",
      LAW.highRiseMinRoadM.source,
      roadShown
        ? `${roadLabel(roadShown.road)} is ${fmt(roadShown.road.widthM)} m wide; a high-rise needs a public road of at least ${minRoad} m`
        : "The plot faces no public road",
    ),
    check(
      "highRise.frontage",
      frontageShown && longEnough(frontageShown) ? "pass" : "fail",
      frontageShown?.frontageM ?? null,
      minFrontage,
      "m",
      LAW.highRiseMinFrontageM.source,
      frontageShown
        ? `The plot has ${fmt(frontageShown.frontageM)} m along ${roadLabel(frontageShown.road)}; a high-rise needs at least ${minFrontage} m on one road of ${minRoad} m or wider`
        : "The plot faces no public road",
    ),
  ];
  if (best) {
    checks.push(
      check(
        "highRise.largeRoad",
        best.road.widthM >= largeRoad ? "pass" : "warn",
        best.road.widthM,
        largeRoad,
        "m",
        LAW.highRiseLargeRoadM.source,
        best.road.widthM >= largeRoad
          ? `${roadLabel(best.road)} is ${fmt(best.road.widthM)} m wide, so total floor area is not capped`
          : `${roadLabel(best.road)} is under ${largeRoad} m wide, so a high-rise here is capped at ${LAW.highRiseLargeGfaM2.toLocaleString("en-US")} m² of total floor area`,
      ),
    );
  }
  checks.push(
    check(
      "highRise.clearance",
      fits ? "pass" : "fail",
      areaAt23M2,
      null,
      "m2",
      LAW.highRiseClearanceM.source,
      fits
        ? `With ${LAW.highRiseClearanceM.value} m clear on every side, ${Math.round(areaAt23M2)} m² of the plot can rise above ${LAW.highRiseThresholdM.value} m`
        : `With ${LAW.highRiseClearanceM.value} m clear on every side, no part of the plot can rise to ${LAW.highRiseThresholdM.value} m`,
    ),
  );

  const accessOk = !toggles.highRiseGate || best !== undefined;
  const capped = toggles.highRiseGate && best !== undefined && best.road.widthM < largeRoad;
  return {
    allowed: accessOk && fits,
    checks,
    maxGfaM2: capped ? LAW.highRiseLargeGfaM2 : null,
  };
}

export function roadLabel(road: Road): string {
  return road.name ?? "Unnamed road";
}
