import { describe, expect, it } from "vitest";
import { isLargeBuilding, requiredSpaces, spacesForUse } from "./parking";

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

  it("takes the larger of the use's rate and the large-building rate", () => {
    expect(requiredSpaces("hotel", need(100 * 70, 1_000))).toBe(Math.ceil(8_000 / 120));
    expect(requiredSpaces("hotel", need(25 * 70, 0, 6))).toBe(0);
    expect(requiredSpaces("office", need(1_800, 100, 6))).toBe(30);
  });
});
