import type { BuildingType } from "../inputs";
import type { FloorUse } from "../outputs";

/**
 * How sure we are of a number: stated in a source, derived by arithmetic from sources, or an
 * unsourced industry norm.
 */
export type Confidence = "stated" | "derived" | "estimate";

export type Assumption<T> = { value: T; unit: string; source: string; confidence: Confidence };

const KKBS =
  "Study of 60 Bangkok-region high-rise condominiums 2014–18, KKBS journal (https://so04.tci-thaijo.org/index.php/kkbsjournal/article/download/247752/175680/968808)";

/** Every design number that is not law, with where it comes from, so the UI can show them. */
export const DESIGN_ASSUMPTIONS = {
  lobbyHeightM: {
    value: 4.5,
    unit: "m",
    source: "Common ground-floor lobby height; statutory minimums are lower (MR 55 cl. 22)",
    confidence: "estimate",
  },
  parkingFloorHeightM: {
    value: 3,
    unit: "m",
    source: "Clear height of 2.10 m (MR 7) plus structure",
    confidence: "estimate",
  },
  floorHeightM: {
    value: { condo: 3.1, office: 4, hotel: 3.2 },
    unit: "m",
    source:
      "Typical floor-to-floor heights; statutory minimum rooms are 2.60 m (homes, hotels) and 3.00 m (offices), MR 55 cl. 22",
    confidence: "estimate",
  },
  retailFloorHeightM: {
    value: 4.5,
    unit: "m",
    source:
      "Common shop floor-to-floor height; the statutory minimum for shops is 3.50 m (MR 55 cl. 22)",
    confidence: "estimate",
  },
  amenityFloorHeightM: {
    value: 4,
    unit: "m",
    source: "Common height for a gym, pool deck or lounge floor",
    confidence: "estimate",
  },
  parkingM2PerSpace: {
    value: 27,
    unit: "m² per space",
    source: `Gross parking area per car incl. aisles and ramps, 25.3–27.7 m² (${KKBS})`,
    confidence: "stated",
  },
  condoUnitM2: {
    value: 45,
    unit: "m² net",
    source: `Average unit 41.6–50.4 m² in 11–40 storey buildings (${KKBS})`,
    confidence: "stated",
  },
  condoEfficiency: {
    value: 0.67,
    unit: "saleable ÷ residential floor area",
    source: `Saleable area 65–69% of construction area excluding parking (${KKBS})`,
    confidence: "derived",
  },
  hotelM2PerKey: {
    value: 70,
    unit: "m² of floor area per room",
    source: "Mid-scale hotels use 55–75 m² of total floor area per key",
    confidence: "estimate",
  },
  towerPlateM2: {
    value: { condo: 1_100, office: 1_500, hotel: 1_000 },
    unit: "m²",
    source: `Condo plates 877–1,436 m² (${KKBS}); Grade A office plates 1,000–3,000 m²`,
    confidence: "estimate",
  },
  towerAspects: {
    value: [1, 1.5, 2, 2.5],
    unit: "length ÷ depth",
    source: "Shapes tried for the tower plate; the one that keeps the most area wins",
    confidence: "estimate",
  },
  minTowerPlateM2: {
    value: 250,
    unit: "m²",
    source: "Smallest tower floor worth building (core plus a few units)",
    confidence: "estimate",
  },
  minFloorM2: {
    value: 50,
    unit: "m²",
    source: "Smallest floor (or partial top floor) a design keeps",
    confidence: "estimate",
  },
} as const satisfies Record<string, Assumption<unknown>>;

export function floorHeightM(buildingType: BuildingType): number {
  return DESIGN_ASSUMPTIONS.floorHeightM.value[buildingType];
}

/** The floor use a building type is mostly made of. */
export const MAIN_USE = {
  condo: "residential",
  office: "office",
  hotel: "hotel",
} as const satisfies Record<BuildingType, FloorUse>;

/** Typical floor-to-floor height of each floor use (estimates; see `DESIGN_ASSUMPTIONS`). */
export const USE_FLOOR_HEIGHT_M = {
  lobby: DESIGN_ASSUMPTIONS.lobbyHeightM.value,
  parking: DESIGN_ASSUMPTIONS.parkingFloorHeightM.value,
  retail: DESIGN_ASSUMPTIONS.retailFloorHeightM.value,
  amenity: DESIGN_ASSUMPTIONS.amenityFloorHeightM.value,
  residential: DESIGN_ASSUMPTIONS.floorHeightM.value.condo,
  office: DESIGN_ASSUMPTIONS.floorHeightM.value.office,
  hotel: DESIGN_ASSUMPTIONS.floorHeightM.value.hotel,
} as const satisfies Record<FloorUse, number>;

/**
 * `DesignSpec.unitSizeM2` sizes hotel rooms in a hotel and condo units in a condo or an office;
 * the other lodging use keeps its default size.
 */
export function unitSizes(
  buildingType: BuildingType,
  unitSizeM2: number,
): { condoUnitM2: number; hotelM2PerKey: number } {
  const a = DESIGN_ASSUMPTIONS;
  return buildingType === "hotel"
    ? { condoUnitM2: a.condoUnitM2.value, hotelM2PerKey: unitSizeM2 }
    : { condoUnitM2: unitSizeM2, hotelM2PerKey: a.hotelM2PerKey.value };
}

export function defaultUnitSizeM2(buildingType: BuildingType): number {
  const a = DESIGN_ASSUMPTIONS;
  return buildingType === "hotel" ? a.hotelM2PerKey.value : a.condoUnitM2.value;
}

/** Condo units in this much residential floor area. */
export function condoUnits(residentialM2: number, unitM2: number): number {
  return Math.floor((residentialM2 * DESIGN_ASSUMPTIONS.condoEfficiency.value) / unitM2);
}

/** Hotel rooms in this much hotel floor area. */
export function hotelRooms(hotelM2: number, m2PerKey: number): number {
  return Math.floor(hotelM2 / m2PerKey);
}

/** Condo units or hotel rooms from main-use floor area; null for offices. */
export function keyCount(buildingType: BuildingType, useAreaM2: number): number | null {
  const a = DESIGN_ASSUMPTIONS;
  if (buildingType === "condo") return condoUnits(useAreaM2, a.condoUnitM2.value);
  if (buildingType === "hotel") return hotelRooms(useAreaM2, a.hotelM2PerKey.value);
  return null;
}
