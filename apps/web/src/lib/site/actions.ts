import type { SideRoad } from "@envelope/db/site";
import type { PlotDraft, VertexId } from "@/lib/plot/draft";
import { updateSiteRoads, usePlotStore } from "@/lib/plot/store";
import type { PlotContextResult } from "./client";
import { currentContext, type SiteContext } from "./request";
import { useSiteStore } from "./store";
import {
  applyRoadSuggestion,
  autoMarkRoads,
  markSide,
  matchSides,
  stationDistanceM,
} from "./suggest";

function sameSides(draft: PlotDraft, sideIds: readonly VertexId[]) {
  return (
    draft.vertices.length === sideIds.length && draft.vertices.every((v, i) => v.id === sideIds[i])
  );
}

/** Stores a plot-context answer and applies what may be applied without asking. */
export function receivePlotContext(result: PlotContextResult, sideIds: readonly VertexId[]) {
  const site = useSiteStore.getState();
  const plot = usePlotStore.getState();
  switch (result.kind) {
    case "aborted":
      return;
    case "failed":
      site.dispatch({ type: "failed", message: result.message });
      return;
    case "no-data":
      site.dispatch({ type: "no-data", reason: result.reason });
      site.spendAutoMark();
      if (site.station === "detected") plot.setStationDistance(null);
      return;
    case "inside": {
      const context: SiteContext = {
        sideIds,
        matches: matchSides(sideIds, result.context.sides),
        nearestStation: result.context.nearestStation,
      };
      site.dispatch({ type: "loaded", context });
      if (site.station === "detected") {
        plot.setStationDistance(stationDistanceM(context.nearestStation));
      }
      if (site.autoMark === "armed" && sameSides(plot.draft, sideIds)) {
        const marked = autoMarkRoads(plot, context.matches);
        if (marked) updateSiteRoads(() => marked);
        site.spendAutoMark();
      }
    }
  }
}

function matches() {
  return currentContext(useSiteStore.getState().request)?.matches ?? new Map();
}

export function acceptSideSuggestion(side: VertexId, osm: SideRoad) {
  updateSiteRoads((state) => markSide(state, matches(), side, osm));
}

export function acceptRoadSuggestion(roadId: string, osm: SideRoad) {
  updateSiteRoads((state) => ({
    draft: state.draft,
    roads: applyRoadSuggestion(state.roads, roadId, osm),
  }));
}

export function typeStationDistance(meters: number | null) {
  useSiteStore.getState().setStationSource("user");
  usePlotStore.getState().setStationDistance(meters);
}

export function resetToDetectedStation() {
  const context = currentContext(useSiteStore.getState().request);
  useSiteStore.getState().setStationSource("detected");
  usePlotStore.getState().setStationDistance(stationDistanceM(context?.nearestStation ?? null));
}
