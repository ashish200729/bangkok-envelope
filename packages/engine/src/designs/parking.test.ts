import { describe, expect, it } from "vitest";
import {
  isLargeBuilding,
  requiredSpaces,
  requiredSpacesFor,
  spacesByUse,
  spacesForUse,
} from "./parking";

const need = (useAreaM2: number, otherAreaM2 = 0, heightM = 10) => ({
  useAreaM2,
  otherAreaM2,
  totalAreaM2: useAreaM2 + otherAreaM2,
  heightM,
});

describe("parking minimums (MR 7 cl. 3(1))", () => {
  it("classes large buildings by area, or by height and area", () => {
    expect(isLargeBuilding(2_000, 10)).toBe(false);
    expect(isLargeBuilding(2_001, 10)).toBe(true);
    expect(isLargeBuilding(1_001, 15)).toBe(true);
    expect(isLargeBuilding(1_001, 14.9)).toBe(false);
  });

  it("condos with ~45 m² units follow the large-building rate", () => {
    expect(requiredSpaces("condo", need(1_500, 400))).toBe(0);
    expect(requiredSpaces("condo", need(12_000, 2_400))).toBe(120);
  });

  it("offices need one space per 60 m² from 300 m²", () => {
    expect(requiredSpaces("office", need(290))).toBe(0);
    expect(requiredSpaces("office", need(600))).toBe(10);
    expect(requiredSpaces("office", need(6_000, 1_200))).toBe(100);
  });

  it("hotels count rooms: 10 for the first 30, 1 per 5 to 100, then 1 per 10", () => {
    const rooms = (n: number) => spacesForUse("hotel", n * 70);
    expect(rooms(30)).toBe(0);
    expect(rooms(31)).toBe(11);
    expect(rooms(35)).toBe(11);
    expect(rooms(36)).toBe(12);
    expect(rooms(100)).toBe(24);
    expect(rooms(101)).toBe(25);
    expect(rooms(250)).toBe(39);
  });

  it("adds up the uses of a mixed building (cl. 4), with retail at 1 per 20 m² from 300 m²", () => {
    const areaM2 = {
      lobby: 200,
      parking: 3_000,
      retail: 600,
      amenity: 400,
      residential: 0,
      office: 1_200,
      hotel: 0,
    };
    const mix = { areaM2, condoUnits: 0, condoUnitM2: 45, hotelRooms: 0, heightM: 30 };
    expect(spacesByUse(mix)).toBe(30 + 20);
    expect(requiredSpacesFor(mix)).toBe(50);
    expect(spacesByUse({ ...mix, areaM2: { ...areaM2, retail: 299 } })).toBe(20);
    const big = { ...mix, areaM2: { ...areaM2, amenity: 10_000 } };
    expect(requiredSpacesFor(big)).toBe(Math.ceil((200 + 600 + 10_000 + 1_200) / 120));
    const units = { ...mix, condoUnits: 40, condoUnitM2: 80 };
    expect(spacesByUse(units)).toBe(50 + 40);
  });

  it("takes the larger of the use's rate and the large-building rate", () => {
    expect(requiredSpaces("hotel", need(100 * 70, 1_000))).toBe(Math.ceil(8_000 / 120));
    expect(requiredSpaces("hotel", need(25 * 70, 0, 6))).toBe(0);
    expect(requiredSpaces("office", need(1_800, 100, 6))).toBe(30);
  });
});
