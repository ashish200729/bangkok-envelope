import { type RoadFrontage, roadLabel } from "./high-rise";
import { BUILDING_TYPE_INFO, type EngineInput, ZONES } from "./inputs";
import type { Citation } from "./law";
import type { AppliedRule } from "./outputs";
import { RULE_INFO, type RuleId } from "./rules";
import { farLimit, LAW, openSpaceMin, roadSetbackM, sizeCapForUse, ZONE_RULES } from "./rules-data";

type Line = {
  value: number | null;
  source: Citation;
  affectsEnvelope: boolean;
  enabled: boolean;
  note?: string;
};

function rule(id: RuleId, line: Line): AppliedRule {
  const { note, ...rest } = line;
  return {
    id,
    label: RULE_INFO[id].label,
    unit: RULE_INFO[id].unit,
    ...rest,
    ...(note === undefined ? {} : { note }),
  };
}

const n = (value: number) => (Math.round(value * 100) / 100).toLocaleString("en-US");

function roadSetbackNote(f: RoadFrontage): string {
  const w = f.road.widthM;
  const name = roadLabel(f.road);
  if (w < LAW.roadSetbackCentrelineBelowM) {
    return `${name}, ${n(w)} m wide: ${LAW.roadSetbackFromCentrelineM} m from the road centreline, so ${n(roadSetbackM(w))} m from the property line`;
  }
  if (w <= LAW.roadSetbackTenthUpToM) {
    return `${name}, ${n(w)} m wide: a tenth of the road width from the property line`;
  }
  return `${name}, ${n(w)} m wide: ${LAW.roadSetbackWideRoadM} m from the property line on roads over ${LAW.roadSetbackTenthUpToM} m`;
}

/** Every rule that applies to this plot, in the order the rules panel shows them. */
export function appliedRules(
  input: EngineInput,
  frontages: readonly RoadFrontage[],
): AppliedRule[] {
  const { zone, toggles, buildingType, farBonusPct } = input;
  const zoneRules = ZONE_RULES[zone];
  const zoneLabel = ZONES[zone].labelTh;
  const typeName = BUILDING_TYPE_INFO[buildingType].name.toLowerCase();
  const baseFar = zoneRules.farMax.value;
  const totalFar = farLimit(zone, farBonusPct, false);
  const widestRoadM = Math.max(0, ...frontages.map((f) => f.road.widthM));
  const highRiseOn = toggles.roadSetback || toggles.boundarySetback;

  const lines: AppliedRule[] = [
    rule("far.max", {
      value: baseFar,
      source: zoneRules.farMax.source,
      affectsEnvelope: false,
      enabled: true,
      note: `Zone ${zoneLabel}: total floor area up to ${baseFar} × plot area`,
    }),
    rule("far.bonus", {
      value: totalFar - baseFar,
      source: LAW.farBonusMaxPct.source,
      affectsEnvelope: false,
      enabled: true,
      note:
        farBonusPct > 0
          ? `${n(farBonusPct)}% bonus claimed, so FAR ${n(totalFar)} in total`
          : `No bonus claimed; incentives can add up to ${LAW.farBonusMaxPct.value}%`,
    }),
    rule("osr.min", {
      value: zoneRules.osrMin.value,
      source: zoneRules.osrMin.source,
      affectsEnvelope: false,
      enabled: toggles.openSpace,
      note: "Open ground ÷ total floor area; half of it must be planted",
    }),
    rule("openSpace.min", {
      value: openSpaceMin(buildingType).value,
      source: openSpaceMin(buildingType).source,
      affectsEnvelope: false,
      enabled: toggles.openSpace,
      note: `Share of the plot left as open ground for a ${typeName} (also BMA ordinance cl. 52)`,
    }),
    ...frontages.map((f) =>
      rule("setback.road", {
        value: roadSetbackM(f.road.widthM),
        source: LAW.roadSetback.source,
        affectsEnvelope: true,
        enabled: toggles.roadSetback,
        note: roadSetbackNote(f),
      }),
    ),
    rule("setback.boundary", {
      value: LAW.boundaryLow.value,
      source: LAW.boundaryLow.source,
      affectsEnvelope: true,
      enabled: toggles.boundarySetback,
      note: `Walls with windows up to ${LAW.boundaryStepHeightM} m high`,
    }),
    rule("setback.boundary", {
      value: LAW.boundaryHigh.value,
      source: LAW.boundaryHigh.source,
      affectsEnvelope: true,
      enabled: toggles.boundarySetback,
      note: `Walls with windows above ${LAW.boundaryStepHeightM} m`,
    }),
    ...frontages.map((f) =>
      rule("height.roadPlane", {
        value: LAW.roadPlaneRatio.value * f.road.widthM,
        source: LAW.roadPlaneRatio.source,
        affectsEnvelope: true,
        enabled: toggles.roadHeightPlane,
        note: `${roadLabel(f.road)}: height at most ${LAW.roadPlaneRatio.value} × the distance to the far side of the road, so ${n(LAW.roadPlaneRatio.value * f.road.widthM)} m at the property line, rising ${LAW.roadPlaneRatio.value} m per metre back`,
      }),
    ),
    rule("highRise.threshold", {
      value: LAW.highRiseThresholdM.value,
      source: LAW.highRiseThresholdM.source,
      affectsEnvelope: true,
      enabled: true,
      note: "From this height the high-rise rules below apply",
    }),
    rule("highRise.road", {
      value: LAW.highRiseMinRoadM.value,
      source: LAW.highRiseMinRoadM.source,
      affectsEnvelope: true,
      enabled: toggles.highRiseGate,
      note: "A high-rise must face a public road at least this wide",
    }),
    rule("highRise.frontage", {
      value: LAW.highRiseMinFrontageM.value,
      source: LAW.highRiseMinFrontageM.source,
      affectsEnvelope: true,
      enabled: toggles.highRiseGate,
      note: `Plot side length along that road`,
    }),
    rule("highRise.largeRoad", {
      value: LAW.highRiseLargeRoadM.value,
      source: LAW.highRiseLargeRoadM.source,
      affectsEnvelope: false,
      enabled: toggles.highRiseGate,
      note: `Needed above ${LAW.highRiseLargeGfaM2.toLocaleString("en-US")} m² of total floor area; on a narrower road a high-rise is capped there`,
    }),
    rule("highRise.clearance", {
      value: LAW.highRiseClearanceM.value,
      source: LAW.highRiseClearanceM.source,
      affectsEnvelope: true,
      enabled: highRiseOn,
      note: "Every part of a high-rise, ground floors included, from neighbouring plots and the road",
    }),
    rule("highRise.farCeiling", {
      value: LAW.highRiseFarCeiling.value,
      source: LAW.highRiseFarCeiling.source,
      affectsEnvelope: false,
      enabled: true,
      note:
        totalFar > LAW.highRiseFarCeiling.value
          ? `Caps this plot's FAR ${n(totalFar)} at ${LAW.highRiseFarCeiling.value} for a high-rise`
          : `Above this plot's FAR ${n(totalFar)}, so it does not bind`,
    }),
    sizeRule(input, widestRoadM),
    rule("parking.min", {
      value: null,
      source: LAW.parking.source,
      affectsEnvelope: false,
      enabled: true,
      note: "Counted for each design from its units and floor area",
    }),
  ];
  return lines;
}

function sizeRule(input: EngineInput, widestRoadM: number): AppliedRule {
  const { zone, buildingType } = input;
  const limit = sizeCapForUse(zone, buildingType, widestRoadM, input.site.stationDistanceM);
  const id: RuleId = buildingType === "hotel" ? "use.rooms" : "use.size";
  const zoneLabel = ZONES[zone].labelTh;
  const typeName = BUILDING_TYPE_INFO[buildingType].name.toLowerCase();
  if (limit.kind === "none") {
    return rule(id, {
      value: null,
      source: limit.source,
      affectsEnvelope: false,
      enabled: true,
      note:
        buildingType === "condo"
          ? `No size cap for a ${typeName} in ${zoneLabel}`
          : `No cap here: the road width or a station within ${LAW.stationRadiusM} m meets every condition in ${zoneLabel}`,
    });
  }
  const unit = limit.unit === "m2" ? "m²" : "rooms";
  const need = limit.blockedBy.needsRoadM;
  return rule(id, {
    value: limit.max,
    source: limit.source,
    affectsEnvelope: false,
    enabled: true,
    note:
      need === null
        ? `A ${typeName} in ${zoneLabel} may not exceed ${limit.max.toLocaleString("en-US")} ${unit}`
        : `Above ${limit.max.toLocaleString("en-US")} ${unit} a ${typeName} in ${zoneLabel} needs a road of at least ${need} m or a station within ${LAW.stationRadiusM} m`,
  });
}
