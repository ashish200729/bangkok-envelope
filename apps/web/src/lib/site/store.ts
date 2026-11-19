import { create } from "zustand";
import { IDLE, reduceSiteRequest, type SiteRequest, type SiteRequestEvent } from "./request";

/** Where the station distance came from: the detected station, or a value the user typed. */
export type StationSource = "detected" | "user";

type SiteState = {
  request: SiteRequest;
  /**
   * The first site data for a new plot may mark its road sides; later results only suggest.
   * "armed" until that first result arrives.
   */
  autoMark: "armed" | "spent";
  station: StationSource;
  /** Bumped by Retry to repeat the request. */
  attempt: number;
};

type SiteActions = {
  dispatch: (event: SiteRequestEvent) => void;
  newPlot: () => void;
  spendAutoMark: () => void;
  setStationSource: (station: StationSource) => void;
  retry: () => void;
};

export const useSiteStore = create<SiteState & SiteActions>()((set) => ({
  request: IDLE,
  autoMark: "armed",
  station: "detected",
  attempt: 0,
  dispatch: (event) => set((s) => ({ request: reduceSiteRequest(s.request, event) })),
  newPlot: () => set({ request: IDLE, autoMark: "armed", station: "detected" }),
  spendAutoMark: () => set({ autoMark: "spent" }),
  setStationSource: (station) => set({ station }),
  retry: () => set((s) => ({ attempt: s.attempt + 1 })),
}));
