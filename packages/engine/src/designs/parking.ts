import type { BuildingType } from "../inputs";
import type { Citation } from "../law";
import { DESIGN_ASSUMPTIONS, keyCount } from "./assumptions";

const mr7: Citation = { law: "mr-7", clause: "3(1)" };

/** Bangkok parking minimums (MR 7 cl. 3(1), as amended by MR 41). */
export const PARKING_RULES = {
  source: mr7,
  /** Condo: one space per unit larger than this. */
  condoUnitOverM2: 60,
  /** A large building: over 2,000 m², or at least 15 m tall and over 1,000 m². */
  largeBuildingOverM2: 2_000,
  largeBuildingTallM: 15,
  largeBuildingTallOverM2: 1_000,
  /** A large building needs one space per this much floor area outside its parking. */
  largeBuildingM2PerSpace: 120,
  /** Offices of at least this size need one space per `officeM2PerSpace`. */
  officeFromM2: 300,
  officeM2PerSpace: 60,
  /** Hotels: 10 spaces for the first 30 rooms, 1 per 5 rooms up to 100, then 1 per 10. */
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

/** Spaces the use's own rate asks for, before the large-building rate. */
export function spacesForUse(buildingType: BuildingType, useAreaM2: number): number {
  const r = PARKING_RULES;
  switch (buildingType) {
    case "condo": {
      // With ~45 m² average units no unit is over 60 m², so the large-building rate governs.
      const units = keyCount("condo", useAreaM2) ?? 0;
      return DESIGN_ASSUMPTIONS.condoUnitM2.value > r.condoUnitOverM2 ? units : 0;
    }
    case "office":
      return useAreaM2 >= r.officeFromM2 ? Math.ceil(useAreaM2 / r.officeM2PerSpace) : 0;
    case "hotel": {
      const rooms = keyCount("hotel", useAreaM2) ?? 0;
      if (rooms <= r.hotelFromRooms) return 0;
      const mid = Math.min(rooms, r.hotelMidUpToRooms) - r.hotelFromRooms;
      const high = Math.max(0, rooms - r.hotelMidUpToRooms);
      return (
        r.hotelBaseSpaces +
        Math.ceil(mid / r.hotelMidRoomsPerSpace) +
        Math.ceil(high / r.hotelHighRoomsPerSpace)
      );
    }
  }
}

export function isLargeBuilding(totalAreaM2: number, heightM: number): boolean {
  const r = PARKING_RULES;
  return (
    totalAreaM2 > r.largeBuildingOverM2 ||
    (heightM >= r.largeBuildingTallM && totalAreaM2 > r.largeBuildingTallOverM2)
  );
}

/** Spaces the law asks for: the use's own rate or the large-building rate, whichever is more. */
export function requiredSpaces(buildingType: BuildingType, need: ParkingNeed): number {
  const large = isLargeBuilding(need.totalAreaM2, need.heightM)
    ? Math.ceil((need.useAreaM2 + need.otherAreaM2) / PARKING_RULES.largeBuildingM2PerSpace)
    : 0;
  return Math.max(spacesForUse(buildingType, need.useAreaM2), large);
}
