"use client";

import dynamic from "next/dynamic";
import { readStoredPlot } from "@/lib/plot/persist";
import { usePlotStore } from "@/lib/plot/store";
import { prefetchBasemap } from "./basemap-prefetch";

const loadMap = () => import("./plot-map");

// Start the map bundle and the basemap downloads as soon as this module runs, not when the map
// first renders: they no longer wait for each other (decision 65).
if (typeof window !== "undefined") {
  const vertices = readStoredPlot()?.draft.vertices ?? usePlotStore.getState().draft.vertices;
  const centre = vertices.reduce<[number, number]>(
    (sum, v) => [sum[0] + v.lngLat[0] / vertices.length, sum[1] + v.lngLat[1] / vertices.length],
    [0, 0],
  );
  void prefetchBasemap(centre);
  void loadMap();
}

/** The map libraries are large and browser-only, so the map loads after the page shell. */
export const PlotMapLoader = dynamic(loadMap, {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-muted text-muted-foreground text-sm">
      Loading the map…
    </div>
  ),
});
