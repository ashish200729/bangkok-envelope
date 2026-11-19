import {
  ALL_RULES_ON,
  type BuildingType,
  type LngLat,
  MAX_FAR_BONUS_PCT,
  type Road,
  type RuleToggles,
  SAMPLE_INPUT,
  type ZoneCode,
} from "@envelope/engine";
import { create } from "zustand";
import {
  draftFromRing,
  openRing,
  type PlotDraft,
  reconcileVertices,
  type SideRole,
  type VertexId,
} from "./draft";
import type { PlotSettings } from "./engine-input";

export type MapMode = "edit" | "draw";

type PlotState = {
  draft: PlotDraft;
  roads: Road[];
  settings: PlotSettings;
  mode: MapMode;
  hoveredSide: VertexId | null;
  selectedSide: VertexId | null;
  /**
   * Bumped whenever the plot geometry changes from outside the map (reset, cancel), so the map
   * reloads it. Edits made on the map do not bump it.
   */
  geometryRevision: number;
  /** "checking" from a new drawing until the map reports what stands on the plot. */
  siteCheck: "checking" | "done";
  /** The user confirmed the buildings on this plot will be demolished (lib/plot/clearance). */
  demolitionConfirmed: boolean;
};

type PlotActions = {
  applyMapGeometry: (ring: readonly LngLat[]) => void;
  startDrawing: () => void;
  finishDrawing: (ring: readonly LngLat[]) => void;
  cancelDrawing: () => void;
  setSideRole: (side: VertexId, role: SideRole) => void;
  addRoadForSide: (side: VertexId) => void;
  setRoadWidth: (roadId: string, widthM: number) => void;
  setZone: (zone: ZoneCode) => void;
  setBuildingType: (buildingType: BuildingType) => void;
  setStationDistance: (meters: number | null) => void;
  setToggle: (rule: keyof RuleToggles, on: boolean) => void;
  setFarBonus: (pct: number) => void;
  setHoveredSide: (side: VertexId | null) => void;
  setSelectedSide: (side: VertexId | null) => void;
  resetToSample: () => void;
  /** The map has measured the buildings on the plot just drawn. */
  markSiteChecked: () => void;
  confirmDemolition: () => void;
  /** A plot saved in this browser (lib/plot/persist.ts), loaded into the map like a reset. */
  restorePlot: (plot: {
    draft: PlotDraft;
    roads: readonly Road[];
    settings: PlotSettings;
    demolitionConfirmed: boolean;
  }) => void;
};

export const DEFAULT_ROAD_WIDTH_M = 12;

export const newVertexId = () => crypto.randomUUID() as VertexId;

function sampleState(): Pick<PlotState, "draft" | "roads" | "settings"> {
  const draft = draftFromRing(SAMPLE_INPUT.plot.vertices, newVertexId);
  const sides: Record<VertexId, SideRole> = {};
  SAMPLE_INPUT.plot.edges.forEach((edge, i) => {
    const vertex = draft.vertices[i];
    if (vertex && edge.kind === "road") sides[vertex.id] = { kind: "road", roadId: edge.roadId };
  });
  return {
    draft: { ...draft, sides },
    roads: SAMPLE_INPUT.roads.map((road) => ({ ...road })),
    settings: {
      zone: SAMPLE_INPUT.zone,
      buildingType: SAMPLE_INPUT.buildingType,
      farBonusPct: SAMPLE_INPUT.farBonusPct,
      stationDistanceM: SAMPLE_INPUT.site.stationDistanceM,
      toggles: ALL_RULES_ON,
    },
  };
}

/** Keeps only roads some side still faces. */
function usedRoads(draft: PlotDraft, roads: readonly Road[]): Road[] {
  const used = new Set(
    Object.values(draft.sides).flatMap((role) => (role.kind === "road" ? [role.roadId] : [])),
  );
  return roads.filter((road) => used.has(road.id));
}

function nextRoadName(roads: readonly Road[]): string {
  const taken = new Set(roads.map((r) => r.name));
  for (let i = 0; ; i++) {
    const name = i < 26 ? `Road ${String.fromCharCode(65 + i)}` : `Road ${i + 1}`;
    if (!taken.has(name)) return name;
  }
}

export const usePlotStore = create<PlotState & PlotActions>()((set) => ({
  ...sampleState(),
  mode: "edit",
  hoveredSide: null,
  selectedSide: null,
  geometryRevision: 0,
  siteCheck: "done",
  demolitionConfirmed: false,

  applyMapGeometry: (ring) =>
    set((s) => {
      const draft = reconcileVertices(s.draft, ring, newVertexId);
      const exists = (id: VertexId | null) =>
        id !== null && draft.vertices.some((v) => v.id === id);
      return {
        draft,
        roads: usedRoads(draft, s.roads),
        hoveredSide: exists(s.hoveredSide) ? s.hoveredSide : null,
        selectedSide: exists(s.selectedSide) ? s.selectedSide : null,
      };
    }),

  startDrawing: () => set({ mode: "draw", hoveredSide: null, selectedSide: null }),

  finishDrawing: (ring) =>
    set(() => ({
      mode: "edit",
      draft: draftFromRing(openRing(ring), newVertexId),
      roads: [],
      hoveredSide: null,
      selectedSide: null,
      siteCheck: "checking",
      demolitionConfirmed: false,
    })),

  cancelDrawing: () => set((s) => ({ mode: "edit", geometryRevision: s.geometryRevision + 1 })),

  setSideRole: (side, role) =>
    set((s) => {
      const draft = { ...s.draft, sides: { ...s.draft.sides, [side]: role } };
      return { draft, roads: usedRoads(draft, s.roads) };
    }),

  addRoadForSide: (side) =>
    set((s) => {
      const road: Road = {
        id: crypto.randomUUID(),
        name: nextRoadName(s.roads),
        widthM: DEFAULT_ROAD_WIDTH_M,
        widthSource: "user",
      };
      const draft = {
        ...s.draft,
        sides: { ...s.draft.sides, [side]: { kind: "road" as const, roadId: road.id } },
      };
      return { draft, roads: usedRoads(draft, [...s.roads, road]) };
    }),

  setRoadWidth: (roadId, widthM) =>
    set((s) => ({
      roads: s.roads.map((road) =>
        road.id === roadId ? { ...road, widthM, widthSource: "user" as const } : road,
      ),
    })),

  setZone: (zone) => set((s) => ({ settings: { ...s.settings, zone } })),
  setBuildingType: (buildingType) => set((s) => ({ settings: { ...s.settings, buildingType } })),
  setStationDistance: (stationDistanceM) =>
    set((s) => ({ settings: { ...s.settings, stationDistanceM } })),
  setToggle: (rule, on) =>
    set((s) => ({
      settings: { ...s.settings, toggles: { ...s.settings.toggles, [rule]: on } },
    })),
  setFarBonus: (pct) =>
    set((s) => ({
      settings: { ...s.settings, farBonusPct: Math.min(MAX_FAR_BONUS_PCT, Math.max(0, pct)) },
    })),

  setHoveredSide: (hoveredSide) => set({ hoveredSide }),
  setSelectedSide: (selectedSide) => set({ selectedSide }),

  resetToSample: () =>
    set((s) => ({
      ...sampleState(),
      mode: "edit",
      hoveredSide: null,
      selectedSide: null,
      geometryRevision: s.geometryRevision + 1,
      siteCheck: "done",
      demolitionConfirmed: false,
    })),

  markSiteChecked: () => set((s) => (s.siteCheck === "checking" ? { siteCheck: "done" } : {})),
  confirmDemolition: () => set({ demolitionConfirmed: true }),
  restorePlot: (plot) =>
    set((s) => ({
      draft: plot.draft,
      roads: usedRoads(plot.draft, plot.roads),
      settings: plot.settings,
      demolitionConfirmed: plot.demolitionConfirmed,
      // An unconfirmed plot waits for the map to say what stands on it, as after drawing.
      siteCheck: plot.demolitionConfirmed ? "done" : "checking",
      mode: "edit",
      hoveredSide: null,
      selectedSide: null,
      geometryRevision: s.geometryRevision + 1,
    })),
}));

/** Site data (lib/site): replaces sides and roads with an OSM suggestion applied to them. */
export function updateSiteRoads(
  update: (state: { draft: PlotDraft; roads: readonly Road[] }) => {
    draft: PlotDraft;
    roads: readonly Road[];
  },
) {
  usePlotStore.setState((s) => {
    const next = update(s);
    return { draft: next.draft, roads: usedRoads(next.draft, next.roads) };
  });
}
