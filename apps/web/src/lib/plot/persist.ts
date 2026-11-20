import {
  buildingTypeSchema,
  MAX_FAR_BONUS_PCT,
  roadSchema,
  ruleTogglesSchema,
  zoneCodeSchema,
} from "@envelope/engine";
import { z } from "zod";
import type { PlotDraft, SideRole, VertexId } from "./draft";
import type { PlotSettings } from "./engine-input";
import { usePlotStore } from "./store";
import { currentSiteHold } from "./use-site-hold";

/**
 * The plot the user was working on, kept in this browser so a reload brings it back: corners,
 * what each side faces, roads, settings and the demolition answer. Bump the key when the stored
 * shape changes; an entry that does not parse is ignored and the sample plot is shown.
 */
export const PLOT_STORAGE_KEY = "envelope.plot.v1";
const MAX_CORNERS = 400;
const SITE_CHECK_FALLBACK_MS = 10_000;

const lngLatSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const sideRoleSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("boundary") }),
  z.strictObject({ kind: z.literal("road"), roadId: z.string().min(1).max(100) }),
]);

const storedPlotSchema = z.object({
  vertices: z
    .array(z.object({ id: z.string().min(1).max(100), lngLat: lngLatSchema }))
    .min(3)
    .max(MAX_CORNERS),
  sides: z.record(z.string(), sideRoleSchema),
  roads: z.array(roadSchema).max(MAX_CORNERS),
  settings: z.object({
    zone: zoneCodeSchema,
    buildingType: buildingTypeSchema,
    farBonusPct: z.number().min(0).max(MAX_FAR_BONUS_PCT),
    stationDistanceM: z.number().min(0).max(100_000).nullable(),
    toggles: ruleTogglesSchema,
  }),
  demolitionConfirmed: z.boolean(),
  /** The plot had been checked and nothing on it held results. Missing in older entries. */
  siteClear: z.boolean().optional(),
});

export type StoredPlot = {
  draft: PlotDraft;
  roads: z.infer<typeof roadSchema>[];
  settings: PlotSettings;
  demolitionConfirmed: boolean;
  siteClear: boolean;
};

export function parseStoredPlot(raw: string | null): StoredPlot | null {
  if (!raw) return null;
  try {
    const parsed = storedPlotSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const { vertices, sides, roads, settings, demolitionConfirmed, siteClear } = parsed.data;
    const ids = new Set(vertices.map((v) => v.id));
    if (ids.size !== vertices.length) return null;
    return {
      draft: {
        vertices: vertices.map((v) => ({ id: v.id as VertexId, lngLat: v.lngLat })),
        // Sides of corners that no longer exist are dropped.
        sides: Object.fromEntries(Object.entries(sides).filter(([id]) => ids.has(id))) as Record<
          VertexId,
          SideRole
        >,
      },
      roads,
      settings,
      demolitionConfirmed,
      siteClear: siteClear ?? false,
    };
  } catch {
    return null;
  }
}

export function serializePlot(plot: StoredPlot): string {
  return JSON.stringify({
    vertices: plot.draft.vertices,
    sides: plot.draft.sides,
    roads: plot.roads,
    settings: plot.settings,
    demolitionConfirmed: plot.demolitionConfirmed,
    siteClear: plot.siteClear,
  });
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The saved plot, without restoring it. Browser only; null when there is none. */
export function readStoredPlot(): StoredPlot | null {
  try {
    return parseStoredPlot(storage()?.getItem(PLOT_STORAGE_KEY) ?? null);
  } catch {
    return null;
  }
}

/**
 * Brings back the saved plot, then saves the plot after every change (debounced). Only finished
 * plots are saved: while drawing, the last finished one stays stored. Browser only.
 */
export function startPlotPersistence(): () => void {
  const store = storage();
  if (!store) return () => {};
  const saved = readStoredPlot();
  let fallback: ReturnType<typeof setTimeout> | null = null;
  if (saved) {
    usePlotStore.getState().restorePlot(saved);
    // If the map never reports (no WebGL, tiles blocked), results must not wait forever.
    fallback = setTimeout(() => usePlotStore.getState().markSiteChecked(), SITE_CHECK_FALLBACK_MS);
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    const s = usePlotStore.getState();
    if (s.mode !== "edit") return;
    try {
      store.setItem(
        PLOT_STORAGE_KEY,
        serializePlot({
          draft: s.draft,
          roads: s.roads,
          settings: s.settings,
          demolitionConfirmed: s.demolitionConfirmed,
          siteClear: s.siteCheck === "done" && !currentSiteHold().held,
        }),
      );
    } catch {
      // Storage full or blocked: the plot still works, it just won't survive a reload.
    }
  };
  const unsubscribe = usePlotStore.subscribe((s, prev) => {
    if (
      s.draft === prev.draft &&
      s.roads === prev.roads &&
      s.settings === prev.settings &&
      s.demolitionConfirmed === prev.demolitionConfirmed &&
      s.siteCheck === prev.siteCheck &&
      s.mode === prev.mode
    ) {
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 300);
  });
  return () => {
    if (timer) clearTimeout(timer);
    if (fallback) clearTimeout(fallback);
    unsubscribe();
  };
}
