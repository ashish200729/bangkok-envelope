import { BUILDING_TYPE_INFO, type BuildingType, type ZoneCode } from "./inputs";
import type { Citation } from "./law";

/** A number from the law, with where it comes from. */
export type Sourced<T> = { value: T; source: Citation };

export type ZoneRules = {
  farMax: Sourced<number>;
  osrMin: Sourced<number>;
};

const plan = (clause: string): Citation => ({ law: "bkk-plan-2556", clause });
const mr33 = (clause: string): Citation => ({ law: "mr-33", clause });
const bma = (clause: string): Citation => ({ law: "bma-2544", clause });

export const ZONE_RULES = {
  Y8: { farMax: { value: 6, source: plan("15") }, osrMin: { value: 0.05, source: plan("15") } },
  Y9: { farMax: { value: 7, source: plan("16") }, osrMin: { value: 0.045, source: plan("16") } },
  Y10: { farMax: { value: 8, source: plan("17") }, osrMin: { value: 0.04, source: plan("17") } },
} as const satisfies Record<ZoneCode, ZoneRules>;

export const LAW = {
  farBonusMaxPct: { value: 20, source: plan("51–57") },
  roadSetback: { source: bma("50") },
  /** Below this road width the setback is measured from the road centreline. */
  roadSetbackCentrelineBelowM: 10,
  roadSetbackFromCentrelineM: 6,
  /** Up to this road width the setback is a tenth of the width. */
  roadSetbackTenthUpToM: 20,
  roadSetbackWideRoadM: 2,
  boundaryLow: { value: 2, source: bma("54") },
  boundaryHigh: { value: 3, source: bma("54") },
  /** Walls up to this height keep the lower boundary distance. */
  boundaryStepHeightM: 9,
  /** Height at a point ≤ this × horizontal distance to the far side of the road. */
  roadPlaneRatio: { value: 2, source: bma("49") },
  highRiseThresholdM: { value: 23, source: mr33("1") },
  highRiseMinRoadM: { value: 10, source: mr33("2") },
  highRiseLargeRoadM: { value: 18, source: mr33("2") },
  highRiseLargeGfaM2: 30_000,
  highRiseMinFrontageM: { value: 12, source: mr33("2") },
  highRiseClearanceM: { value: 6, source: mr33("4") },
  highRiseFarCeiling: { value: 10, source: mr33("5") },
  openSpaceResidential: { value: 0.3, source: mr33("6") },
  openSpaceOther: { value: 0.1, source: mr33("6") },
  parking: { source: { law: "mr-7", clause: "3" } satisfies Citation },
  /** A station counts for the plan's exceptions when it is within this distance. */
  stationRadiusM: 500,
} as const;

/** Setback of a building from the property line of a road it faces (BMA ordinance cl. 50). */
export function roadSetbackM(roadWidthM: number): number {
  if (roadWidthM < LAW.roadSetbackCentrelineBelowM) {
    return Math.max(0, LAW.roadSetbackFromCentrelineM - roadWidthM / 2);
  }
  if (roadWidthM <= LAW.roadSetbackTenthUpToM) return roadWidthM / 10;
  return LAW.roadSetbackWideRoadM;
}

/** Distance to a neighbouring plot for walls with openings at height z (BMA ordinance cl. 54). */
export function boundaryDistanceM(heightM: number): number {
  return heightM <= LAW.boundaryStepHeightM ? LAW.boundaryLow.value : LAW.boundaryHigh.value;
}

/**
 * How far inside the property line of a road a point at height z must be (BMA ordinance cl. 49):
 * z ≤ 2 × (distance to the property line + road width). Zero when the plane does not bind.
 */
export function roadPlaneDistanceM(heightM: number, roadWidthM: number): number {
  return Math.max(0, heightM / LAW.roadPlaneRatio.value - roadWidthM);
}

/** Share of the plot that must stay open ground (MR 33 cl. 6; BMA ordinance cl. 52). */
export function openSpaceMin(buildingType: BuildingType): Sourced<number> {
  return BUILDING_TYPE_INFO[buildingType].residential
    ? LAW.openSpaceResidential
    : LAW.openSpaceOther;
}

/** One step of a use-size rule: above `above`, the use needs a road this wide or a nearby station. */
export type UseSizeTier = {
  above: number;
  /** Null: not allowed above `above` at all. */
  needsRoadM: number | null;
  stationExempts: boolean;
};

export type UseSizeRule = {
  unit: "m2" | "rooms";
  source: Citation;
  tiers: readonly UseSizeTier[];
};

/**
 * Office and retail operating area and hotel room caps in ย.8–ย.10 (2013 plan cl. 15–17: offices
 * 15(12), 16(10), 17(10); commerce 15(11), 16(9), 17(9); hotels e.g. 15(8)). Condos have no cap.
 * Tiers ascend; a site may go up to the first tier it does not meet.
 */
export const USE_SIZE_RULES = {
  Y8: {
    condo: null,
    office: {
      unit: "m2",
      source: plan("15"),
      tiers: [
        { above: 1_000, needsRoadM: 12, stationExempts: true },
        { above: 2_000, needsRoadM: 16, stationExempts: true },
        { above: 5_000, needsRoadM: 30, stationExempts: true },
        { above: 10_000, needsRoadM: null, stationExempts: false },
      ],
    },
    hotel: {
      unit: "rooms",
      source: plan("15"),
      tiers: [{ above: 50, needsRoadM: 16, stationExempts: true }],
    },
    retail: {
      unit: "m2",
      source: plan("15(11)"),
      tiers: [
        { above: 5_000, needsRoadM: 16, stationExempts: true },
        { above: 10_000, needsRoadM: 30, stationExempts: true },
      ],
    },
  },
  Y9: {
    condo: null,
    office: {
      unit: "m2",
      source: plan("16"),
      tiers: [{ above: 10_000, needsRoadM: 16, stationExempts: true }],
    },
    hotel: {
      unit: "rooms",
      source: plan("16"),
      tiers: [{ above: 80, needsRoadM: 12, stationExempts: true }],
    },
    retail: {
      unit: "m2",
      source: plan("16(9)"),
      tiers: [
        { above: 5_000, needsRoadM: 12, stationExempts: true },
        { above: 10_000, needsRoadM: 16, stationExempts: true },
      ],
    },
  },
  Y10: {
    condo: null,
    office: {
      unit: "m2",
      source: plan("17"),
      tiers: [{ above: 10_000, needsRoadM: 12, stationExempts: true }],
    },
    hotel: {
      unit: "rooms",
      source: plan("17"),
      tiers: [{ above: 80, needsRoadM: 12, stationExempts: true }],
    },
    retail: {
      unit: "m2",
      source: plan("17(9)"),
      tiers: [
        { above: 5_000, needsRoadM: 12, stationExempts: true },
        { above: 10_000, needsRoadM: 16, stationExempts: true },
      ],
    },
  },
} as const satisfies Record<ZoneCode, Record<SizedUse, UseSizeRule | null>>;

/** Uses with a size rule of their own: the building types, and retail floors (การประกอบพาณิชยกรรม). */
export type SizedUse = BuildingType | "retail";

export type UseSizeLimit =
  | { kind: "none"; source: Citation }
  | { kind: "capped"; unit: "m2" | "rooms"; max: number; source: Citation; blockedBy: UseSizeTier };

export function stationCounts(stationDistanceM: number | null): boolean {
  return stationDistanceM !== null && stationDistanceM <= LAW.stationRadiusM;
}

/** The largest office or retail area, or hotel room count, this site allows, given its widest road. */
export function sizeCapForUse(
  zone: ZoneCode,
  use: SizedUse,
  widestRoadM: number,
  stationDistanceM: number | null,
): UseSizeLimit {
  const rule: UseSizeRule | null = USE_SIZE_RULES[zone][use];
  if (!rule) return { kind: "none", source: ZONE_RULES[zone].farMax.source };
  const station = stationCounts(stationDistanceM);
  const blockedBy = rule.tiers.find(
    (tier) =>
      !(tier.stationExempts && station) &&
      (tier.needsRoadM === null || widestRoadM < tier.needsRoadM),
  );
  if (!blockedBy) return { kind: "none", source: rule.source };
  return { kind: "capped", unit: rule.unit, max: blockedBy.above, source: rule.source, blockedBy };
}

/** Base FAR plus the claimed bonus (2013 plan cl. 51–57), capped at 10 for high-rises (MR 33 cl. 5). */
export function farLimit(zone: ZoneCode, farBonusPct: number, highRise: boolean): number {
  const base = ZONE_RULES[zone].farMax.value;
  const withBonus = base * (1 + Math.min(farBonusPct, LAW.farBonusMaxPct.value) / 100);
  return highRise ? Math.min(withBonus, LAW.highRiseFarCeiling.value) : withBonus;
}
