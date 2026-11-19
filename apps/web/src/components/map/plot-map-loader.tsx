"use client";

import dynamic from "next/dynamic";

/** The map libraries are large and browser-only, so the map loads after the page shell. */
export const PlotMapLoader = dynamic(() => import("./plot-map"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-muted text-muted-foreground text-sm">
      Loading the map…
    </div>
  ),
});
