import { describe, expect, it } from "vitest";
import {
  normalizeBuilding,
  normalizeRoad,
  normalizeStation,
  parseLength,
  parseLevels,
} from "./site-normalize";

describe("parseLength", () => {
  it.each([
    ["12", 12],
    ["12.5", 12.5],
    ["12,5", 12.5],
    ["12 m", 12],
    ["12m", 12],
    [" 40 metres ", 40],
    ["10 ft", 3.048],
    ["10'", 3.048],
    ["10'6\"", 3.2004],
  ])("reads %j as %d m", (raw, metres) => {
    expect(parseLength(raw)).toBeCloseTo(metres, 4);
  });

  it.each(["", "tall", "12 storeys", "-5", "1e3", "12;14", "approx 12", "NaN", "Infinity"])(
    "rejects %j",
    (raw) => {
      expect(parseLength(raw)).toBeNull();
    },
  );
});

describe("parseLevels", () => {
  it("takes the highest of multiple values", () => {
    expect(parseLevels("3;4")).toBe(4);
    expect(parseLevels("12; 30")).toBe(30);
  });

  it("rejects garbage, zero and absurd counts", () => {
    expect(parseLevels("many")).toBeNull();
    expect(parseLevels("0")).toBeNull();
    expect(parseLevels("-2")).toBeNull();
    expect(parseLevels("999")).toBeNull();
    expect(parseLevels(undefined)).toBeNull();
  });

  it("allows zero where a minimum level is meant", () => {
    expect(parseLevels("0", true)).toBe(0);
  });
});

describe("normalizeBuilding", () => {
  it("prefers the tagged height, with units", () => {
    expect(normalizeBuilding({ building: "yes", height: "45 m", "building:levels": "10" })).toEqual(
      {
        heightM: 45,
        baseM: 0,
        heightSource: "height",
        levels: 10,
        kind: "building",
        name: null,
      },
    );
  });

  it("falls back to levels × 3.2 m", () => {
    const b = normalizeBuilding({ building: "apartments", "building:levels": "3;4" });
    expect(b).toMatchObject({
      heightM: 12.8,
      heightSource: "levels",
      levels: 4,
      kind: "apartments",
    });
  });

  it("guesses by type when nothing is tagged", () => {
    expect(normalizeBuilding({ building: "yes" })).toMatchObject({
      heightM: 9.6,
      heightSource: "default",
    });
    expect(normalizeBuilding({ building: "house" })).toMatchObject({ heightM: 6.4 });
    expect(normalizeBuilding({ building: "roof" })).toMatchObject({ heightM: 3.2 });
  });

  it("ignores a garbage height and uses levels instead", () => {
    expect(
      normalizeBuilding({ building: "yes", height: "tall", "building:levels": "5" }),
    ).toMatchObject({ heightM: 16, heightSource: "levels" });
  });

  it("lifts the base from min_height or building:min_level", () => {
    expect(normalizeBuilding({ building: "roof", height: "8", min_height: "5 m" }).baseM).toBe(5);
    expect(
      normalizeBuilding({ building: "yes", "building:levels": "10", "building:min_level": "2" })
        .baseM,
    ).toBe(6.4);
  });

  it("puts the building on the ground when the base is not below the top", () => {
    expect(normalizeBuilding({ building: "yes", height: "6", min_height: "9" }).baseM).toBe(0);
  });

  it("names the building in English when OSM has both", () => {
    expect(normalizeBuilding({ building: "yes", name: "อาคาร", "name:en": "Tower" }).name).toBe(
      "Tower",
    );
    expect(normalizeBuilding({ building: "yes", name: "อาคาร" }).name).toBe("อาคาร");
  });
});

describe("normalizeRoad", () => {
  it("uses the width tag as osm-tag", () => {
    expect(normalizeRoad({ highway: "residential", width: "10 m" })).toMatchObject({
      widthM: 10,
      widthSource: "osm-tag",
    });
    expect(normalizeRoad({ highway: "residential", width: "6;8" })).toMatchObject({ widthM: 8 });
  });

  it("estimates from lanes plus footpaths", () => {
    expect(normalizeRoad({ highway: "tertiary", lanes: "2" })).toMatchObject({
      widthM: 10.5,
      widthSource: "osm-estimate",
      lanes: 2,
    });
  });

  it("doubles the lanes of one carriageway of a divided main road", () => {
    expect(normalizeRoad({ highway: "primary", lanes: "3", oneway: "yes" }).widthM).toBe(23.5);
    expect(normalizeRoad({ highway: "residential", lanes: "1", oneway: "yes" }).widthM).toBe(7.25);
  });

  it("falls back to the class default", () => {
    expect(normalizeRoad({ highway: "primary" })).toMatchObject({
      widthM: 30,
      widthSource: "osm-estimate",
    });
    expect(normalizeRoad({ highway: "residential", width: "wide" }).widthM).toBe(8);
    expect(normalizeRoad({ highway: "service" }).widthM).toBe(6);
  });

  it("keeps Thai and English names apart", () => {
    expect(
      normalizeRoad({ highway: "residential", name: "ซอยสุขุมวิท 19", "name:en": "Soi Sukhumvit 19" }),
    ).toMatchObject({ name: "ซอยสุขุมวิท 19", nameEn: "Soi Sukhumvit 19" });
  });
});

describe("normalizeStation", () => {
  it("reads name, English name and network", () => {
    expect(normalizeStation("node/1", { name: "อโศก", "name:en": "Asok", network: "BTS" })).toEqual(
      { name: "อโศก", nameEn: "Asok", network: "BTS" },
    );
  });

  it("falls back to the operator's network when OSM has none", () => {
    expect(normalizeStation("node/2", { name: "X", operator: "ระบบขนส่งมวลชนกรุงเทพ" }).network).toBe(
      "BTS",
    );
  });

  it("corrects known mis-tagged stations by OSM id", () => {
    // Asok BTS is tagged with the MRT operator in OSM.
    expect(
      normalizeStation("node/5391625873", { name: "อโศก", operator: "ทางด่วนและรถไฟฟ้ากรุงเทพ" })
        .network,
    ).toBe("BTS Sukhumvit Line");
  });
});
