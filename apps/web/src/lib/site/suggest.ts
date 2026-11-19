import type { NearestStation, PlotContext, SideRoad } from "@envelope/db/site";
import type { Road } from "@envelope/engine";
import { type PlotDraft, sideRole, type VertexId } from "@/lib/plot/draft";

/** The engine accepts at most this many roads. */
export const MAX_ROADS = 8;

export type RoadState = { draft: PlotDraft; roads: readonly Road[] };
export type SideMatches = ReadonlyMap<VertexId, SideRoad>;

/**
 * Service roads are mostly private access lanes and car-park aisles, so they are offered as
 * suggestions but never marked automatically: a wrong road side loosens setbacks and height.
 */
const NEVER_AUTO_MARKED = new Set(["service"]);

export const osmRoadId = (osmId: string) => `osm-${osmId}`;

export const roundWidthM = (widthM: number) => Math.max(0.5, Math.round(widthM * 2) / 2);

export function osmRoadName(road: SideRoad): string {
  return road.nameEn ?? road.name ?? `Unnamed ${road.class.replaceAll("_", " ")} road`;
}

/** "Faces Sukhumvit Road?", or "Faces an unnamed service road?" for roads OSM has no name for. */
export function sideSuggestionText(road: SideRoad): string {
  const named = road.nameEn ?? road.name;
  return `Faces ${named ?? `an unnamed ${road.class.replaceAll("_", " ")} road`}?`;
}

export function roadFromOsm(road: SideRoad): Road {
  return {
    id: osmRoadId(road.osmId),
    name: osmRoadName(road),
    widthM: roundWidthM(road.widthM),
    widthSource: road.widthSource,
  };
}

/** Pairs the API's per-index sides with the vertex ids the request was made for. */
export function matchSides(
  sideIds: readonly VertexId[],
  sides: PlotContext["sides"],
): Map<VertexId, SideRoad> {
  const matches = new Map<VertexId, SideRoad>();
  for (const side of sides) {
    const id = sideIds[side.index];
    if (id && side.road) matches.set(id, side.road);
  }
  return matches;
}

/**
 * The road already standing for an OSM way: one created from it, one a matched side faces, or
 * one of the same name and width. OSM splits a street into many ways (and a divided road into two
 * carriageways); counted as separate roads, a frontage along one street would be split and could
 * fail the 12 m frontage rule for a high-rise.
 */
function roadIdForWay(state: RoadState, matches: SideMatches, osm: SideRoad): string | null {
  const own = osmRoadId(osm.osmId);
  if (state.roads.some((road) => road.id === own)) return own;
  for (const vertex of state.draft.vertices) {
    const role = sideRole(state.draft, vertex.id);
    if (role.kind === "road" && matches.get(vertex.id)?.osmId === osm.osmId) return role.roadId;
  }
  if (osm.nameEn === null && osm.name === null) return null;
  const { name, widthM } = roadFromOsm(osm);
  return state.roads.find((road) => road.name === name && road.widthM === widthM)?.id ?? null;
}

/** Marks one side as facing the OSM road, reusing the road if another side already faces it. */
export function markSide(
  state: RoadState,
  matches: SideMatches,
  side: VertexId,
  osm: SideRoad,
): RoadState {
  const existing = roadIdForWay(state, matches, osm);
  if (!existing && state.roads.length >= MAX_ROADS) return state;
  const road = existing ? null : roadFromOsm(osm);
  return {
    draft: {
      ...state.draft,
      sides: { ...state.draft.sides, [side]: { kind: "road", roadId: existing ?? road?.id ?? "" } },
    },
    roads: road ? [...state.roads, road] : state.roads,
  };
}

/**
 * For a plot with no road sides yet, marks every side the API matched to a road, one road per
 * named street (OSM ways of the same name and width), else per OSM way. Null when nothing changes
 * or the user has already marked a side.
 */
export function autoMarkRoads(state: RoadState, matches: SideMatches): RoadState | null {
  const marked = state.draft.vertices.some((v) => sideRole(state.draft, v.id).kind === "road");
  if (marked) return null;
  let next = state;
  for (const vertex of state.draft.vertices) {
    const osm = matches.get(vertex.id);
    if (osm && !NEVER_AUTO_MARKED.has(osm.class)) next = markSide(next, matches, vertex.id, osm);
  }
  return next === state ? null : next;
}

/** Neighbour sides that run along a road: offered as "Faces …? Apply". */
export function sideSuggestions(state: RoadState, matches: SideMatches): Map<VertexId, SideRoad> {
  const suggestions = new Map<VertexId, SideRoad>();
  for (const vertex of state.draft.vertices) {
    const osm = matches.get(vertex.id);
    if (osm && sideRole(state.draft, vertex.id).kind === "boundary") {
      suggestions.set(vertex.id, osm);
    }
  }
  return suggestions;
}

/**
 * Roads whose name or width differ from what OSM has for the first side facing them. The user's
 * values stay until they press Apply.
 */
export function roadSuggestions(state: RoadState, matches: SideMatches): Map<string, SideRoad> {
  const firstMatch = new Map<string, SideRoad>();
  for (const vertex of state.draft.vertices) {
    const role = sideRole(state.draft, vertex.id);
    const osm = matches.get(vertex.id);
    if (role.kind === "road" && osm && !firstMatch.has(role.roadId)) {
      firstMatch.set(role.roadId, osm);
    }
  }
  const suggestions = new Map<string, SideRoad>();
  for (const road of state.roads) {
    const osm = firstMatch.get(road.id);
    if (osm && (road.name !== osmRoadName(osm) || road.widthM !== roundWidthM(osm.widthM))) {
      suggestions.set(road.id, osm);
    }
  }
  return suggestions;
}

/** Takes OSM's name and width for a road, keeping its id so its sides stay attached. */
export function applyRoadSuggestion(roads: readonly Road[], roadId: string, osm: SideRoad): Road[] {
  const { name, widthM, widthSource } = roadFromOsm(osm);
  return roads.map((road) => (road.id === roadId ? { ...road, name, widthM, widthSource } : road));
}

export const WIDTH_PROVENANCE: Record<Road["widthSource"], string> = {
  "osm-tag": "from OSM tag",
  "osm-estimate": "estimated from road type — check on site",
  user: "entered by you",
};

const SUGGESTED_WIDTH_SOURCE: Record<SideRoad["widthSource"], string> = {
  "osm-tag": "from OSM tag",
  "osm-estimate": "estimated from road type",
};

export function roadSuggestionText(osm: SideRoad): string {
  return `OSM suggests ${osmRoadName(osm)} · ${roundWidthM(osm.widthM)} m (${SUGGESTED_WIDTH_SOURCE[osm.widthSource]})`;
}

export function stationDistanceM(station: NearestStation | null): number | null {
  return station ? Math.round(station.distanceM) : null;
}

export function stationLabel(station: NearestStation): string {
  const name = station.nameEn ?? station.name;
  const distance = `${Math.round(station.distanceM).toLocaleString("en-US")} m`;
  return [name, station.network, distance].filter(Boolean).join(" · ");
}
