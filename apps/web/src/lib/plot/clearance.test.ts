import { describe, expect, it } from "vitest";
import type { AsBuiltBuilding } from "@/lib/scene/as-built";
import { buildingCount, clearanceFor, countsAsCovered, siteHold } from "./clearance";

const building = (over: Partial<AsBuiltBuilding>): AsBuiltBuilding => ({
  id: "1:20:0",
  footprintM2: 400,
  overlapM2: 400,
  heightM: 20,
  baseM: 0,
  ...over,
});

describe("which buildings a plot covers", () => {
  it("ignores a sliver along a neighbour's wall", () => {
    expect(countsAsCovered(building({ footprintM2: 900, overlapM2: 12 }))).toBe(false);
  });

  it("counts any building covered by 25 m² or more, however large", () => {
    expect(countsAsCovered(building({ footprintM2: 9_000, overlapM2: 30 }))).toBe(true);
  });

  it("counts a small building mostly on the plot", () => {
    expect(countsAsCovered(building({ footprintM2: 20, overlapM2: 12 }))).toBe(true);
    expect(countsAsCovered(building({ footprintM2: 4, overlapM2: 4 }))).toBe(false);
  });

  it("adds up ground on the plot once, and counts a tower and its podium as one building", () => {
    const c = clearanceFor([
      building({ id: "7:12:0", overlapM2: 300 }),
      building({ id: "7:60:12", overlapM2: 200, heightM: 60, baseM: 12 }),
      building({ id: "8:9:0", overlapM2: 50, heightM: 9 }),
    ]);
    expect(c.groundM2).toBe(350);
    expect(c.tallestM).toBe(60);
    expect(buildingCount(c)).toBe(2);
  });
});

describe("whether results wait for the user", () => {
  const covered = [building({})];

  it("waits while the map checks a new drawing", () => {
    expect(siteHold({ siteCheck: "checking", demolitionConfirmed: false }, [])).toEqual({
      held: true,
      reason: "checking",
    });
  });

  it("waits for confirmation when the plot covers a building", () => {
    const hold = siteHold({ siteCheck: "done", demolitionConfirmed: false }, covered);
    expect(hold.held && hold.reason).toBe("buildings");
  });

  it("goes ahead on open land, or once demolition is confirmed", () => {
    expect(siteHold({ siteCheck: "done", demolitionConfirmed: false }, []).held).toBe(false);
    expect(siteHold({ siteCheck: "done", demolitionConfirmed: true }, covered).held).toBe(false);
  });
});
