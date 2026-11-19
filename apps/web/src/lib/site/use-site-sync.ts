"use client";

import { useEffect } from "react";
import type { PlotDraft } from "@/lib/plot/draft";
import { usePlotStore } from "@/lib/plot/store";
import { receivePlotContext } from "./actions";
import { fetchPlotContext } from "./client";
import { useSiteStore } from "./store";

export const SITE_DEBOUNCE_MS = 350;

/** A plot none of whose corners survive from the previous one: drawn anew or the sample. */
function isNewPlot(prev: PlotDraft, next: PlotDraft) {
  const old = new Set(prev.vertices.map((v) => v.id));
  return next.vertices.every((v) => !old.has(v.id));
}

/** Keeps site data in step with the plot: one request per settled geometry, stale ones aborted. */
export function useSiteSync() {
  const vertices = usePlotStore((s) => s.draft.vertices);
  const mode = usePlotStore((s) => s.mode);
  const attempt = useSiteStore((s) => s.attempt);

  useEffect(
    () =>
      usePlotStore.subscribe((s, prev) => {
        if (s.draft.vertices !== prev.draft.vertices && isNewPlot(prev.draft, s.draft)) {
          useSiteStore.getState().newPlot();
        }
      }),
    [],
  );

  useEffect(() => {
    void attempt;
    if (mode === "draw" || vertices.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      useSiteStore.getState().dispatch({ type: "start" });
      const result = await fetchPlotContext(
        vertices.map((v) => v.lngLat),
        controller.signal,
      );
      if (!controller.signal.aborted) {
        receivePlotContext(
          result,
          vertices.map((v) => v.id),
        );
      }
    }, SITE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [vertices, mode, attempt]);
}
