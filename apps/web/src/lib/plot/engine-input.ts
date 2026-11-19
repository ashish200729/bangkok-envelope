import {
  type BuildingType,
  type EngineInput,
  engineInputSchema,
  type Road,
  type RuleToggles,
  type ZoneCode,
} from "@envelope/engine";
import { type PlotDraft, sideRole } from "./draft";

export type PlotSettings = {
  zone: ZoneCode;
  buildingType: BuildingType;
  farBonusPct: number;
  stationDistanceM: number | null;
  toggles: RuleToggles;
};

export type InputCheck = { ok: true; input: EngineInput } | { ok: false; problems: string[] };

/** Builds the engine input from the UI state and validates it at this boundary. */
export function toEngineInput(
  draft: PlotDraft,
  roads: readonly Road[],
  settings: PlotSettings,
): InputCheck {
  const edges = draft.vertices.map((v) => {
    const role = sideRole(draft, v.id);
    return role.kind === "road" ? { kind: "road" as const, roadId: role.roadId } : role;
  });
  const used = new Set(edges.flatMap((e) => (e.kind === "road" ? [e.roadId] : [])));

  const candidate = {
    plot: { vertices: draft.vertices.map((v) => v.lngLat), edges },
    roads: roads.filter((r) => used.has(r.id)),
    zone: settings.zone,
    buildingType: settings.buildingType,
    farBonusPct: settings.farBonusPct,
    site: { stationDistanceM: settings.stationDistanceM },
    toggles: settings.toggles,
  };

  const parsed = engineInputSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, input: parsed.data };
  return { ok: false, problems: parsed.error.issues.map((issue) => issue.message) };
}
