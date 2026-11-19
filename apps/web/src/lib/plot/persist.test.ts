import { beforeEach, describe, expect, it } from "vitest";
import { parseStoredPlot, serializePlot } from "./persist";
import { usePlotStore } from "./store";

const store = () => usePlotStore.getState();
const current = () => ({
  draft: store().draft,
  roads: store().roads,
  settings: store().settings,
  demolitionConfirmed: store().demolitionConfirmed,
});

beforeEach(() => store().resetToSample());

describe("the saved plot", () => {
  it("comes back exactly as it was saved", () => {
    store().setZone("Y8");
    store().setBuildingType("hotel");
    store().confirmDemolition();
    const restored = parseStoredPlot(serializePlot(current()));
    expect(restored).toEqual(current());
  });

  it("restores into the store and asks the map to reload it", () => {
    const saved = parseStoredPlot(serializePlot({ ...current(), demolitionConfirmed: false }));
    if (!saved) throw new Error("parses");
    const revision = store().geometryRevision;
    store().restorePlot(saved);
    expect(store().geometryRevision).toBe(revision + 1);
    expect(store().siteCheck).toBe("checking");
    expect(store().draft.vertices).toHaveLength(saved.draft.vertices.length);
  });

  it("is ignored when it is broken, from an older shape or not JSON", () => {
    expect(parseStoredPlot(null)).toBeNull();
    expect(parseStoredPlot("{not json")).toBeNull();
    expect(parseStoredPlot(JSON.stringify({ vertices: [] }))).toBeNull();
    const twoCorners = JSON.parse(serializePlot(current()));
    twoCorners.vertices = twoCorners.vertices.slice(0, 2);
    expect(parseStoredPlot(JSON.stringify(twoCorners))).toBeNull();
    const badZone = JSON.parse(serializePlot(current()));
    badZone.settings.zone = "Y99";
    expect(parseStoredPlot(JSON.stringify(badZone))).toBeNull();
  });

  it("drops sides that belong to no corner", () => {
    const raw = JSON.parse(serializePlot(current()));
    raw.sides.ghost = { kind: "boundary" };
    expect(parseStoredPlot(JSON.stringify(raw))?.draft.sides).not.toHaveProperty("ghost");
  });
});
