import { type LngLat, makeProjection } from "@envelope/engine";
import { describe, expect, it } from "vitest";
import { bearingDeg, distanceM, interiorAnglesDeg, perimeterM } from "./geometry";

const O: LngLat = [100.56, 13.7383];
/** A point x metres east and y metres north of O. */
const at = (x: number, y: number): LngLat => makeProjection(O).toLngLat({ x, y });

describe("distanceM", () => {
  it("measures 0.001° on the WGS84 ellipsoid at Bangkok's latitude", () => {
    expect(distanceM(O, [O[0], O[1] + 0.001])).toBeCloseTo(110.637, 2);
    expect(distanceM(O, [O[0] + 0.001, O[1]])).toBeCloseTo(108.155, 2);
  });
});

describe("perimeterM", () => {
  const square = [at(0, 0), at(40, 0), at(40, 50), at(0, 50)];

  it("adds every side of a 40 × 50 m rectangle", () => {
    expect(perimeterM(square)).toBeCloseTo(180, 1);
  });

  it("leaves out the closing side when open", () => {
    expect(perimeterM(square, false)).toBeCloseTo(130, 1);
  });

  it("counts a two-corner outline once", () => {
    expect(perimeterM([at(0, 0), at(30, 40)])).toBeCloseTo(50, 1);
  });

  it("is 0 for fewer than two corners", () => {
    expect(perimeterM([])).toBe(0);
    expect(perimeterM([O])).toBe(0);
  });
});

describe("bearingDeg", () => {
  it.each([
    ["north", at(0, 100), 0],
    ["east", at(100, 0), 90],
    ["south", at(0, -100), 180],
    ["west", at(-100, 0), 270],
    ["north-east", at(100, 100), 45],
    ["30° east of north", at(50, 86.6025), 30],
  ])("points %s", (_name, to, expected) => {
    expect(bearingDeg(O, to)).toBeCloseTo(expected, 2);
  });

  it("is NaN between identical points", () => {
    expect(bearingDeg(O, O)).toBeNaN();
  });
});

describe("interiorAnglesDeg", () => {
  const rectangle = [at(0, 0), at(40, 0), at(40, 50), at(0, 50)];
  const lShape = [at(0, 0), at(40, 0), at(40, 20), at(20, 20), at(20, 40), at(0, 40)];

  it("gives 90° at each corner of a rectangle, either winding", () => {
    for (const angle of interiorAnglesDeg(rectangle)) expect(angle).toBeCloseTo(90, 2);
    for (const angle of interiorAnglesDeg([...rectangle].reverse())) {
      expect(angle).toBeCloseTo(90, 2);
    }
  });

  it("gives a reflex 270° at the inner corner of an L, either winding", () => {
    const angles = interiorAnglesDeg(lShape);
    expect(angles[3]).toBeCloseTo(270, 2);
    expect(angles.reduce((a, b) => a + b, 0)).toBeCloseTo(720, 1);
    expect(interiorAnglesDeg([...lShape].reverse())[2]).toBeCloseTo(270, 2);
  });

  it("measures a right triangle with a 3-4-5 slope", () => {
    const [a, b, c] = interiorAnglesDeg([at(0, 0), at(40, 0), at(0, 30)]);
    expect(a).toBeCloseTo(90, 2);
    expect(b).toBeCloseTo(36.87, 1);
    expect(c).toBeCloseTo(53.13, 1);
  });

  it("gives 180° at a corner in the middle of a straight side", () => {
    expect(interiorAnglesDeg([at(0, 0), at(20, 0), at(40, 0), at(40, 30)])[1]).toBeCloseTo(180, 2);
  });

  it("handles degenerate outlines", () => {
    expect(interiorAnglesDeg([])).toEqual([]);
    expect(interiorAnglesDeg([at(0, 0), at(10, 0)])).toEqual([]);
    const repeated = interiorAnglesDeg([at(0, 0), at(0, 0), at(10, 0), at(0, 10)]);
    expect(repeated[0]).toBeNaN();
    expect(repeated[1]).toBeNaN();
  });
});
