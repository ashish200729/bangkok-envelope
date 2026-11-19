import { beforeEach, describe, expect, it } from "vitest";
import { usePlotStore } from "./store";

const store = () => usePlotStore.getState();

beforeEach(() => store().resetToSample());

describe("plot store", () => {
  it("forgets the selected and hovered side when its corner is deleted", () => {
    const [first, second] = store().draft.vertices;
    if (!first || !second) throw new Error("sample has corners");
    store().setSelectedSide(second.id);
    store().setHoveredSide(second.id);

    const ring = store()
      .draft.vertices.filter((v) => v.id !== second.id)
      .map((v) => v.lngLat);
    store().applyMapGeometry(ring);

    expect(store().selectedSide).toBeNull();
    expect(store().hoveredSide).toBeNull();
  });

  it("keeps the selection when a different corner moves", () => {
    const [first, second] = store().draft.vertices;
    if (!first || !second) throw new Error("sample has corners");
    store().setSelectedSide(first.id);

    const moved = store().draft.vertices.map((v) =>
      v.id === second.id ? ([v.lngLat[0] + 0.00001, v.lngLat[1]] as const) : v.lngLat,
    );
    store().applyMapGeometry(moved);

    expect(store().selectedSide).toBe(first.id);
  });

  it("asks again about demolition for every new drawing", () => {
    store().confirmDemolition();
    expect(store().demolitionConfirmed).toBe(true);
    const ring = store().draft.vertices.map((v) => v.lngLat);
    store().finishDrawing(ring);
    expect(store().demolitionConfirmed).toBe(false);
    expect(store().siteCheck).toBe("checking");
    store().markSiteChecked();
    expect(store().siteCheck).toBe("done");
  });

  it("never gives two roads the same name", () => {
    const sides = store().draft.vertices.map((v) => v.id);
    for (const side of sides.slice(1)) store().addRoadForSide(side);
    const names = store().roads.map((road) => road.name);
    expect(new Set(names).size).toBe(names.length);

    const [, removed] = sides;
    if (!removed) throw new Error("sample has corners");
    store().setSideRole(removed, { kind: "boundary" });
    const last = sides.at(-1);
    if (!last) throw new Error("sample has corners");
    store().addRoadForSide(last);
    const after = store().roads.map((road) => road.name);
    expect(new Set(after).size).toBe(after.length);
  });
});
