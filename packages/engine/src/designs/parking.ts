import type { BuildingType } from "../inputs";
import type { Citation } from "../law";
import type { FloorUse } from "../outputs";
import { FLOOR_USES } from "../spec";
import { DESIGN_ASSUMPTIONS, keyCount, MAIN_USE } from "./assumptions";

const mr7: Citation = { law: "mr-7", clause: "3(1)" };

/** Bangkok parking minimums (MR 7 cl. 3(1), as amended by MR 41). */
export const PARKING_RULES = {
  source: mr7,
  /** Several uses in one building: each use's count, added up (cl. 4). */
  mixedSource: { law: "mr-7", clause: "3(1), 4" } satisfies Citation,
  /** Condo: one space per unit larger than this (cl. 2(3), 3(1)(C)). */
  condoUnitOverM2: 60,
  /** A large building: over 2,000 m², or at least 15 m tall and over 1,000 m² (cl. 1(12)). */
  largeBuildingOverM2: 2_000,
  largeBuildingTallM: 15,
  largeBuildingTallOverM2: 1_000,
  /** A large building needs one space per this much floor area outside its parking (cl. 3(1)(H)). */
  largeBuildingM2PerSpace: 120,
  /** Offices of at least this size need one space per `officeM2PerSpace` (cl. 2(6), 3(1)(F)). */
  officeFromM2: 300,
  officeM2PerSpace: 60,
  /** Shops (MR 7's "department store") of at least this size: one per 20 m² (cl. 2(5), 3(1)(E)). */
  retailFromM2: 300,
  retailM2PerSpace: 20,
  /** Hotels: 10 spaces for the first 30 rooms, 1 per 5 rooms up to 100, then 1 per 10 (cl. 3(1)(B)). */
  hotelFromRooms: 30,
  hotelBaseSpaces: 10,
  hotelMidUpToRooms: 100,
  hotelMidRoomsPerSpace: 5,
  hotelHighRoomsPerSpace: 10,
} as const;

export type ParkingNeed = {
  /** Main-use floor area. */
  useAreaM2: number;
  /** Floor area outside parking and the main use (the lobby). */
  otherAreaM2: number;
  /** Everything, parking included. */
  totalAreaM2: number;
  heightM: number;
};

/** What a building holds, use by use, for the parking count. */
export type UseMix = {
  areaM2: Readonly<Record<FloorUse, number>>;
  condoUnits: number;
  /** Average net unit size of the condo units. */
  condoUnitM2: number;
  hotelRooms: number;
  heightM: number;
};

export function hotelSpaces(rooms: number): number {
  const r = PARKING_RULES;
  if (rooms <= r.hotelFromRooms) return 0;
  const mid = Math.min(rooms, r.hotelMidUpToRooms) - r.hotelFromRooms;
  const high = Math.max(0, rooms - r.hotelMidUpToRooms);
  return (
    r.hotelBaseSpaces +
    Math.ceil(mid / r.hotelMidRoomsPerSpace) +
    Math.ceil(high / r.hotelHighRoomsPerSpace)
  );
}

const perArea = (areaM2: number, fromM2: number, m2PerSpace: number) =>
  areaM2 >= fromM2 ? Math.ceil(areaM2 / m2PerSpace) : 0;

/** Spaces each use's own rate asks for; lobby, amenity and parking floors have none. */
const RATE: Record<FloorUse, (mix: UseMix) => number> = {
  lobby: () => 0,
  parking: () => 0,
  amenity: () => 0,
  residential: (m) => (m.condoUnitM2 > PARKING_RULES.condoUnitOverM2 ? m.condoUnits : 0),
  office: (m) =>
    perArea(m.areaM2.office, PARKING_RULES.officeFromM2, PARKING_RULES.officeM2PerSpace),
  retail: (m) =>
    perArea(m.areaM2.retail, PARKING_RULES.retailFromM2, PARKING_RULES.retailM2PerSpace),
  hotel: (m) => hotelSpaces(m.hotelRooms),
};

/** The uses' own counts added up (MR 7 cl. 4), before the large-building rate. */
export function spacesByUse(mix: UseMix): number {
  return FLOOR_USES.reduce((sum, use) => sum + RATE[use](mix), 0);
}

export function isLargeBuilding(totalAreaM2: number, heightM: number): boolean {
  const r = PARKING_RULES;
  return (
    totalAreaM2 > r.largeBuildingOverM2 ||
    (heightM >= r.largeBuildingTallM && totalAreaM2 > r.largeBuildingTallOverM2)
  );
}

/**
 * Spaces the law asks for: the uses' counts added up, or for a large building 1 per 120 m² of
 * floor area outside the parking floors, whichever is more (MR 7 cl. 3(1)(H), 4).
 */
export function requiredSpacesFor(mix: UseMix): number {
  const total = FLOOR_USES.reduce((sum, use) => sum + mix.areaM2[use], 0);
  const large = isLargeBuilding(total, mix.heightM)
    ? Math.ceil((total - mix.areaM2.parking) / PARKING_RULES.largeBuildingM2PerSpace)
    : 0;
  return Math.max(spacesByUse(mix), large);
}

function mainUseMix(buildingType: BuildingType, need: ParkingNeed): UseMix {
  const areaM2 = Object.fromEntries(FLOOR_USES.map((use) => [use, 0])) as Record<FloorUse, number>;
  areaM2[MAIN_USE[buildingType]] = need.useAreaM2;
  areaM2.lobby = need.otherAreaM2;
  areaM2.parking = Math.max(0, need.totalAreaM2 - need.useAreaM2 - need.otherAreaM2);
  return {
    areaM2,
    condoUnits: buildingType === "condo" ? (keyCount("condo", need.useAreaM2) ?? 0) : 0,
    condoUnitM2: DESIGN_ASSUMPTIONS.condoUnitM2.value,
    hotelRooms: buildingType === "hotel" ? (keyCount("hotel", need.useAreaM2) ?? 0) : 0,
    heightM: need.heightM,
  };
}

/** Spaces the use's own rate asks for, before the large-building rate. */
export function spacesForUse(buildingType: BuildingType, useAreaM2: number): number {
  return spacesByUse(
    mainUseMix(buildingType, {
      useAreaM2,
      otherAreaM2: 0,
      totalAreaM2: useAreaM2,
      heightM: 0,
    }),
  );
}

/** `requiredSpacesFor` for a building of one main use with a lobby and parking. */
export function requiredSpaces(buildingType: BuildingType, need: ParkingNeed): number {
  return requiredSpacesFor(mainUseMix(buildingType, need));
}
