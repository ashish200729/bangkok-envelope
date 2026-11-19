import type { XY } from "@envelope/engine";
import { describe, expect, it } from "vitest";
import { clearestView, occlusion, plotCircle } from "./clear-view";

const at = (x: number, y: number): XY => ({ x, y });
const square: XY[] = [at(-25, -25), at(25, -25), at(25, 25), at(-25, 25)];
const plot = plotCircle(square);
/** A 120 m tower 20 m south of the plot. */
const southTower = { centre: at(0, -80), radiusM: 20, heightM: 120 };

describe("clear camera view", () => {
  it("finds a tower between the camera and the plot, and not one behind the plot", () => {
    // Bearing 0 looks north, so the camera stands south, behind the tower.
    expect(occlusion(plot, [southTower], { bearing: 0, pitch: 55 })).toBeGreaterThan(0);
    // Bearing 180 looks south: the camera is north and the tower is beyond the plot.
    expect(occlusion(plot, [southTower], { bearing: 180, pitch: 55 })).toBe(0);
  });

  it("ignores a low building, and a tall one far away", () => {
    const low = { centre: at(0, -60), radiusM: 10, heightM: 6 };
    const far = { centre: at(0, -600), radiusM: 30, heightM: 200 };
    expect(occlusion(plot, [low, far], { bearing: 0, pitch: 55 })).toBe(0);
  });

  it("keeps the preferred angle when nothing is in the way", () => {
    expect(clearestView(square, [], { bearing: 120, pitch: 55 })).toEqual({
      bearing: 120,
      pitch: 55,
      score: 0,
    });
  });

  it("turns away from a tower that hides the plot", () => {
    // The preferred bearing 0 puts the camera behind the south tower.
    const view = clearestView(square, [southTower], { bearing: 0, pitch: 55 });
    expect(view.score).toBe(0);
    expect(occlusion(plot, [southTower], view)).toBe(0);
    expect(view.bearing).not.toBe(0);
  });

  it("looks down more steeply when towers stand on every side", () => {
    const ring = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
      const r = (deg * Math.PI) / 180;
      return { centre: at(Math.sin(r) * 75, Math.cos(r) * 75), radiusM: 30, heightM: 90 };
    });
    const view = clearestView(square, ring, { bearing: 0, pitch: 55 });
    expect(view.pitch).toBeLessThan(55);
  });
});
