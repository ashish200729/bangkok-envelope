import type { NearestStation, SideRoad } from "@envelope/db/site";
import type { VertexId } from "@/lib/plot/draft";

/** Site data for one version of the plot, with sides keyed by the vertex ids it was asked for. */
export type SiteContext = {
  sideIds: readonly VertexId[];
  matches: ReadonlyMap<VertexId, SideRoad>;
  nearestStation: NearestStation | null;
};

/** Why a plot gets no site data, though the request worked: retrying would not help. */
export type NoSiteData = "outside-area" | "too-large";

export type SiteRequest =
  | { status: "idle" }
  /** `last` keeps the previous result on screen while the next one loads. */
  | { status: "loading"; last: SiteContext | null }
  | { status: "ready"; context: SiteContext }
  | { status: "no-data"; reason: NoSiteData }
  | { status: "error"; message: string };

export type SiteRequestEvent =
  | { type: "start" }
  | { type: "loaded"; context: SiteContext }
  | { type: "no-data"; reason: NoSiteData }
  | { type: "failed"; message: string };

export const IDLE: SiteRequest = { status: "idle" };

export function reduceSiteRequest(state: SiteRequest, event: SiteRequestEvent): SiteRequest {
  switch (event.type) {
    case "start":
      return { status: "loading", last: currentContext(state) };
    case "loaded":
      return { status: "ready", context: event.context };
    case "no-data":
      return { status: "no-data", reason: event.reason };
    case "failed":
      return { status: "error", message: event.message };
  }
}

export function currentContext(state: SiteRequest): SiteContext | null {
  if (state.status === "ready") return state.context;
  if (state.status === "loading") return state.last;
  return null;
}
