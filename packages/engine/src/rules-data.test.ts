import { describe, expect, it } from "vitest";
import { makeProjection } from "./projection";
import {
  boundaryDistanceM,
  farLimit,
  roadPlaneDistanceM,
  roadSetbackM,
  sizeCapForUse,
} from "./rules-data";

describe("road setback (BMA ordinance cl. 50)", () => {
  it.each([
    [4, 4],
    [6, 3],
    [8, 2],
    [9.99, 1.005],
    [10, 1],
    [12, 1.2],
    [20, 2],
    [25, 2],
    [40, 2],
  ])("on a %s m road is %s m from the property line", (width, setback) => {
    expect(roadSetbackM(width)).toBeCloseTo(setback, 6);
  });
});

describe("other distances", () => {
  it("steps the neighbour distance from 2 m to 3 m above 9 m", () => {
    expect([0, 9, 9.01, 50].map(boundaryDistanceM)).toEqual([2, 2, 3, 3]);
  });

  it("binds the road plane only once 2 × road width is exceeded", () => {
    expect(roadPlaneDistanceM(24, 12)).toBe(0);
    expect(roadPlaneDistanceM(30, 12)).toBe(3);
  });
});

describe("FAR", () => {
  it("adds the bonus and caps a high-rise at 10", () => {
    expect(farLimit("Y8", 20, false)).toBeCloseTo(7.2);
    expect(farLimit("Y10", 20, true)).toBeCloseTo(9.6);
    expect(farLimit("Y10", 20, false)).toBeCloseTo(9.6);
  });
});

describe("use size caps (2013 plan cl. 15–17)", () => {
  const cap = (...args: Parameters<typeof sizeCapForUse>) => {
    const limit = sizeCapForUse(...args);
    return limit.kind === "none" ? null : limit.max;
  };

  it("has none for condos", () => {
    expect(cap("Y8", "condo", 4, null)).toBeNull();
  });

  it("steps an office in ย.8 by road width", () => {
    expect(cap("Y8", "office", 8, null)).toBe(1_000);
    expect(cap("Y8", "office", 12, null)).toBe(2_000);
    expect(cap("Y8", "office", 16, null)).toBe(5_000);
    expect(cap("Y8", "office", 30, null)).toBe(10_000);
    expect(cap("Y8", "office", 8, 500)).toBe(10_000);
    expect(cap("Y8", "office", 8, 501)).toBe(1_000);
  });

  it("caps an office in ย.9 and ย.10 only above 10,000 m²", () => {
    expect(cap("Y9", "office", 12, null)).toBe(10_000);
    expect(cap("Y9", "office", 16, null)).toBeNull();
    expect(cap("Y10", "office", 12, null)).toBeNull();
    expect(cap("Y10", "office", 10, 200)).toBeNull();
  });

  it("caps hotel rooms", () => {
    expect(cap("Y8", "hotel", 12, null)).toBe(50);
    expect(cap("Y8", "hotel", 16, null)).toBeNull();
    expect(cap("Y9", "hotel", 10, null)).toBe(80);
    expect(cap("Y10", "hotel", 10, 100)).toBeNull();
  });
});

describe("projection", () => {
  it("round-trips and measures a degree of latitude near Bangkok", () => {
    const projection = makeProjection([100.56, 13.74]);
    const p = projection.toLocal([100.561, 13.741]);
    expect(projection.toLngLat(p)[0]).toBeCloseTo(100.561, 10);
    expect(projection.toLngLat(p)[1]).toBeCloseTo(13.741, 10);
    // WGS84: about 110.6 km per degree of latitude and 108.2 km per degree of longitude here
    expect(p.y).toBeCloseTo(110.6, 0);
    expect(p.x).toBeCloseTo(108.2, 0);
  });
});
