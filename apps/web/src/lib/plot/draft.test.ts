import type { LngLat } from "@envelope/engine";
import { SAMPLE_INPUT } from "@envelope/engine";
import { describe, expect, it } from "vitest";
import { draftFromRing, type PlotDraft, reconcileVertices, sideRole, type VertexId } from "./draft";
import { toEngineInput } from "./engine-input";
import { areaM2, selfIntersects, sideLengthsM } from "./geometry";

function ids() {
  let n = 0;
  return () => `v${n++}` as VertexId;
}

const square: LngLat[] = [
  [100.56, 13.737],
  [100.561, 13.737],
  [100.561, 13.738],
  [100.56, 13.738],
];

function withRoadOnFirstSide(): PlotDraft {
  const draft = draftFromRing(square, ids());
  const first = draft.vertices[0];
  if (!first) throw new Error("draft has vertices");
  return { ...draft, sides: { [first.id]: { kind: "road", roadId: "r1" } } };
}

const roleList = (d: PlotDraft) => d.vertices.map((v) => sideRole(d, v.id).kind);

describe("reconcileVertices", () => {
  it("keeps ids and roles when a corner is dragged", () => {
    const prev = withRoadOnFirstSide();
    const moved = square.map((p, i) => (i === 2 ? ([p[0] + 0.0002, p[1]] as LngLat) : p));
    const next = reconcileVertices(prev, moved, ids());
    expect(next.vertices.map((v) => v.id)).toEqual(prev.vertices.map((v) => v.id));
    expect(next.vertices[2]?.lngLat).toEqual(moved[2]);
    expect(roleList(next)).toEqual(["road", "boundary", "boundary", "boundary"]);
  });

  it("accepts a closed GeoJSON ring from the drawing tool", () => {
    const prev = withRoadOnFirstSide();
    const next = reconcileVertices(prev, [...square, square[0] as LngLat], ids());
    expect(next.vertices).toHaveLength(4);
    expect(roleList(next)).toEqual(roleList(prev));
  });

  it("splits a road side into two road sides when a corner is inserted on it", () => {
    const prev = withRoadOnFirstSide();
    const inserted: LngLat = [100.5605, 13.7369];
    const next = reconcileVertices(
      prev,
      [square[0], inserted, ...square.slice(1)] as LngLat[],
      () => "new" as VertexId,
    );
    expect(next.vertices.map((v) => v.id)).toEqual(["v0", "new", "v1", "v2", "v3"]);
    expect(roleList(next)).toEqual(["road", "road", "boundary", "boundary", "boundary"]);
    expect(sideRole(next, "new" as VertexId)).toEqual({ kind: "road", roadId: "r1" });
  });

  it("handles an insert on the closing side", () => {
    const prev = withRoadOnFirstSide();
    const next = reconcileVertices(prev, [...square, [100.5599, 13.7375]], () => "new" as VertexId);
    expect(next.vertices.at(-1)?.id).toBe("new");
    expect(roleList(next)).toEqual(["road", "boundary", "boundary", "boundary", "boundary"]);
  });

  it("keeps the road when a corner between a road side and a boundary side is deleted", () => {
    const prev = withRoadOnFirstSide();
    const next = reconcileVertices(prev, [square[0], square[2], square[3]] as LngLat[], ids());
    expect(next.vertices.map((v) => v.id)).toEqual(["v0", "v2", "v3"]);
    expect(roleList(next)).toEqual(["road", "boundary", "boundary"]);
    expect(Object.keys(next.sides)).not.toContain("v1");
  });

  it("lets a deleted road side's role pass to the merged side", () => {
    const prev = withRoadOnFirstSide();
    const next = reconcileVertices(prev, [square[1], square[2], square[3]] as LngLat[], ids());
    expect(next.vertices.map((v) => v.id)).toEqual(["v1", "v2", "v3"]);
    expect(sideRole(next, "v3" as VertexId)).toEqual({ kind: "road", roadId: "r1" });
  });

  it("treats an unrelated shape as a new plot with boundary sides only", () => {
    const prev = withRoadOnFirstSide();
    const fresh: LngLat[] = [
      [100.57, 13.74],
      [100.571, 13.74],
      [100.5705, 13.741],
    ];
    const next = reconcileVertices(prev, fresh, () => "fresh" as VertexId);
    expect(next.vertices).toHaveLength(3);
    expect(next.sides).toEqual({});
  });
});

describe("geometry", () => {
  it("measures a ~108 m × 111 m square at Bangkok's latitude", () => {
    const lengths = sideLengthsM(square);
    expect(lengths[0]).toBeCloseTo(108.1, 0);
    expect(lengths[1]).toBeCloseTo(111.2, 0);
    expect(areaM2(square)).toBeCloseTo(108.1 * 111.2, -2);
  });

  it("detects a bow-tie but not a concave plot", () => {
    const bowTie: LngLat[] = [square[0], square[2], square[1], square[3]] as LngLat[];
    const lShape: LngLat[] = [
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 2],
      [0, 2],
    ];
    expect(selfIntersects(bowTie)).toBe(true);
    expect(selfIntersects(lShape)).toBe(false);
    expect(selfIntersects(square)).toBe(false);
  });
});

describe("toEngineInput", () => {
  const settings = {
    zone: "Y10" as const,
    buildingType: "condo" as const,
    farBonusPct: 0,
    stationDistanceM: 420,
    toggles: SAMPLE_INPUT.toggles,
  };
  const road = { id: "r1", widthM: 12, widthSource: "user" as const };

  it("produces a valid engine input with only the roads in use", () => {
    const check = toEngineInput(withRoadOnFirstSide(), [road, { ...road, id: "unused" }], settings);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.input.plot.edges[0]).toEqual({ kind: "road", roadId: "r1" });
      expect(check.input.roads.map((r) => r.id)).toEqual(["r1"]);
    }
  });

  it("reports why the input is not usable", () => {
    const draft = draftFromRing(square.slice(0, 2), ids());
    const check = toEngineInput(draft, [road], settings);
    expect(check.ok).toBe(false);
  });
});
