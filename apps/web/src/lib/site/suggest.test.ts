import type { SideRoad } from "@envelope/db/site";
import type { Road } from "@envelope/engine";
import { describe, expect, it } from "vitest";
import { type PlotDraft, sideRole, type VertexId } from "@/lib/plot/draft";
import {
  applyRoadSuggestion,
  autoMarkRoads,
  MAX_ROADS,
  markSide,
  matchSides,
  osmRoadName,
  type RoadState,
  roadFromOsm,
  roadSuggestions,
  roadSuggestionText,
  roundWidthM,
  sideSuggestions,
  sideSuggestionText,
  stationLabel,
  WIDTH_PROVENANCE,
} from "./suggest";

const id = (s: string) => s as VertexId;
const IDS = [id("a"), id("b"), id("c"), id("d")];

function plot(sides: PlotDraft["sides"] = {}): PlotDraft {
  return {
    vertices: IDS.map((vid, i) => ({ id: vid, lngLat: [100.56 + i * 1e-4, 13.74] as const })),
    sides,
  };
}

const SOI_19: SideRoad = {
  osmId: "way/156261418",
  name: "ซอยสุขุมวิท 19",
  nameEn: "Soi Sukhumvit 19",
  class: "residential",
  widthM: 8.2,
  widthSource: "osm-estimate",
  distanceM: 5.1,
};
const SUKHUMVIT: SideRoad = {
  osmId: "way/1",
  name: "ถนนสุขุมวิท",
  nameEn: "Sukhumvit Road",
  class: "primary",
  widthM: 30,
  widthSource: "osm-tag",
  distanceM: 12,
};
const LANE: SideRoad = { ...SOI_19, osmId: "way/9", name: null, nameEn: null, class: "service" };

const roadOf = (state: RoadState, side: VertexId) => {
  const role = sideRole(state.draft, side);
  return role.kind === "road" ? state.roads.find((r) => r.id === role.roadId) : undefined;
};

describe("matchSides", () => {
  it("keys the API's sides by the vertex ids the request was made for", () => {
    const matches = matchSides(IDS, [
      { index: 0, road: SOI_19 },
      { index: 1, road: null },
      { index: 3, road: SUKHUMVIT },
    ]);
    expect([...matches.keys()]).toEqual([id("a"), id("d")]);
  });
});

describe("autoMarkRoads", () => {
  it("marks every matched side of a new plot with the OSM name and a rounded width", () => {
    const state = { draft: plot(), roads: [] };
    const next = autoMarkRoads(state, matchSides(IDS, [{ index: 0, road: SOI_19 }]));
    expect(next && roadOf(next, id("a"))).toEqual({
      id: "osm-way/156261418",
      name: "Soi Sukhumvit 19",
      widthM: 8,
      widthSource: "osm-estimate",
    });
    expect(next && sideRole(next.draft, id("b"))).toEqual({ kind: "boundary" });
  });

  it("gives sides along one street split into several OSM ways one shared road", () => {
    const otherWay: SideRoad = { ...SUKHUMVIT, osmId: "way/2", distanceM: 20 };
    const narrower: SideRoad = { ...SUKHUMVIT, osmId: "way/3", widthM: 20 };
    const unnamed: SideRoad = { ...SOI_19, name: null, nameEn: null };
    const matches = matchSides(IDS, [
      { index: 0, road: SUKHUMVIT },
      { index: 1, road: otherWay },
      { index: 2, road: narrower },
      { index: 3, road: unnamed },
    ]);
    const next = autoMarkRoads({ draft: plot(), roads: [] }, matches);
    expect(next && roadOf(next, id("a"))).toBe(next && roadOf(next, id("b")));
    expect(next?.roads.map((r) => `${r.name} ${r.widthM}`)).toEqual([
      "Sukhumvit Road 30",
      "Sukhumvit Road 20",
      "Unnamed residential road 8",
    ]);
    const lane: SideRoad = { ...unnamed, osmId: "way/77" };
    const withLane = next && markSide(next, matchSides(IDS, []), id("c"), lane);
    expect(withLane?.roads).toHaveLength(4);
  });

  it("gives sides along the same OSM way one shared road", () => {
    const matches = matchSides(IDS, [
      { index: 0, road: SOI_19 },
      { index: 1, road: SOI_19 },
      { index: 2, road: SUKHUMVIT },
    ]);
    const next = autoMarkRoads({ draft: plot(), roads: [] }, matches);
    expect(next?.roads.map((r) => r.name)).toEqual(["Soi Sukhumvit 19", "Sukhumvit Road"]);
    expect(next && roadOf(next, id("a"))).toBe(next && roadOf(next, id("b")));
  });

  it("leaves a plot alone once the user has marked a side", () => {
    const own: Road = { id: "mine", name: "My soi", widthM: 10, widthSource: "user" };
    const state = { draft: plot({ [id("c")]: { kind: "road", roadId: "mine" } }), roads: [own] };
    expect(autoMarkRoads(state, matchSides(IDS, [{ index: 0, road: SOI_19 }]))).toBeNull();
  });

  it("does not mark service lanes by itself", () => {
    const matches = matchSides(IDS, [{ index: 0, road: LANE }]);
    expect(autoMarkRoads({ draft: plot(), roads: [] }, matches)).toBeNull();
  });

  it("is null when nothing matched", () => {
    expect(autoMarkRoads({ draft: plot(), roads: [] }, new Map())).toBeNull();
  });
});

describe("side suggestions", () => {
  it("offers matched neighbour sides only", () => {
    const state = {
      draft: plot({ [id("a")]: { kind: "road", roadId: "mine" } }),
      roads: [{ id: "mine", widthM: 10, widthSource: "user" as const }],
    };
    const matches = matchSides(IDS, [
      { index: 0, road: SOI_19 },
      { index: 1, road: SUKHUMVIT },
    ]);
    expect([...sideSuggestions(state, matches).keys()]).toEqual([id("b")]);
  });

  it("joins the user's road when the side runs along the same way", () => {
    const own: Road = { id: "mine", name: "Soi 19", widthM: 10, widthSource: "user" };
    const state = { draft: plot({ [id("a")]: { kind: "road", roadId: "mine" } }), roads: [own] };
    const matches = matchSides(IDS, [
      { index: 0, road: SOI_19 },
      { index: 1, road: SOI_19 },
    ]);
    const next = markSide(state, matches, id("b"), SOI_19);
    expect(next.roads).toEqual([own]);
    expect(sideRole(next.draft, id("b"))).toEqual({ kind: "road", roadId: "mine" });
  });

  it("does not add a ninth road", () => {
    const roads: Road[] = Array.from({ length: MAX_ROADS }, (_, i) => ({
      id: `r${i}`,
      widthM: 8,
      widthSource: "user",
    }));
    const state = { draft: plot(), roads };
    expect(markSide(state, new Map(), id("a"), SOI_19)).toBe(state);
  });
});

describe("road suggestions", () => {
  const userRoad: Road = {
    id: "soi-19",
    name: "Soi Sukhumvit 19",
    widthM: 10,
    widthSource: "user",
  };
  const state = {
    draft: plot({ [id("a")]: { kind: "road", roadId: "soi-19" } }),
    roads: [userRoad],
  };
  const matches = matchSides(IDS, [{ index: 0, road: SOI_19 }]);

  it("suggests OSM's width for a road the user typed, without changing it", () => {
    const suggestion = roadSuggestions(state, matches).get("soi-19");
    expect(suggestion && roadSuggestionText(suggestion)).toBe(
      "OSM suggests Soi Sukhumvit 19 · 8 m (estimated from road type)",
    );
    expect(state.roads[0]).toEqual(userRoad);
  });

  it("takes OSM's name and width on Apply and keeps the road id", () => {
    const roads = applyRoadSuggestion(state.roads, "soi-19", SOI_19);
    expect(roads).toEqual([
      { id: "soi-19", name: "Soi Sukhumvit 19", widthM: 8, widthSource: "osm-estimate" },
    ]);
    expect(roadSuggestions({ ...state, roads }, matches).size).toBe(0);
  });

  it("stays quiet when the road already agrees with OSM", () => {
    const osmRoad = { ...userRoad, widthM: 8 };
    expect(roadSuggestions({ ...state, roads: [osmRoad] }, matches).size).toBe(0);
  });
});

describe("formatting", () => {
  it("rounds widths to half a metre", () => {
    expect([8.2, 8.3, 10.74, 0.1].map(roundWidthM)).toEqual([8, 8.5, 10.5, 0.5]);
  });

  it("names roads in English first, then Thai, then by class", () => {
    expect(osmRoadName(SOI_19)).toBe("Soi Sukhumvit 19");
    expect(osmRoadName({ ...SOI_19, nameEn: null })).toBe("ซอยสุขุมวิท 19");
    expect(osmRoadName(LANE)).toBe("Unnamed service road");
    expect(roadFromOsm(SUKHUMVIT).widthSource).toBe("osm-tag");
  });

  it("labels where each width came from", () => {
    expect(WIDTH_PROVENANCE).toEqual({
      "osm-tag": "from OSM tag",
      "osm-estimate": "estimated from road type — check on site",
      user: "entered by you",
    });
    expect(roadSuggestionText(SUKHUMVIT)).toBe("OSM suggests Sukhumvit Road · 30 m (from OSM tag)");
  });

  it("asks whether a neighbour side faces a road", () => {
    expect(sideSuggestionText(SUKHUMVIT)).toBe("Faces Sukhumvit Road?");
    expect(sideSuggestionText(LANE)).toBe("Faces an unnamed service road?");
  });

  it("describes the nearest station", () => {
    expect(
      stationLabel({
        name: "อโศก",
        nameEn: "Asok",
        network: "BTS Sukhumvit Line",
        distanceM: 129.4,
      }),
    ).toBe("Asok · BTS Sukhumvit Line · 129 m");
  });
});
