import {
  type BuildingType,
  type CheckStatus,
  DESIGN_ASSUMPTIONS,
  type EngineInput,
  farLimit,
} from "@envelope/engine";
import type { AnyDesign } from "@/lib/results/view";

/** The figures the studio and the comparison show for one design. */
export type DesignMetrics = {
  gfaM2: number;
  far: number;
  farMax: number;
  heightM: number;
  storeys: number;
  /** Condo units or hotel rooms; null for offices. */
  keys: number | null;
  useAreaM2: number;
  retailM2: number;
  parkingProvided: number;
  parkingRequired: number;
  openGroundM2: number;
  /** Condo saleable area at the studied efficiency; null for offices and hotels. */
  saleableM2: number | null;
  passCount: number;
  failCount: number;
  warnCount: number;
};

export function keyLabel(buildingType: BuildingType): "Units" | "Rooms" | null {
  return buildingType === "condo" ? "Units" : buildingType === "hotel" ? "Rooms" : null;
}

export const MAIN_USE_LABEL: Record<BuildingType, string> = {
  condo: "Homes",
  office: "Offices",
  hotel: "Hotel",
};

const count = (statuses: readonly CheckStatus[], status: CheckStatus) =>
  statuses.filter((s) => s === status).length;

export function designMetrics(design: AnyDesign, input: EngineInput): DesignMetrics {
  const statuses = design.checks.map((c) => c.status);
  return {
    gfaM2: design.gfaM2,
    far: design.farUsed,
    farMax: farLimit(input.zone, input.farBonusPct, false),
    heightM: design.heightM,
    storeys: design.floors.length,
    keys: design.keyCount,
    useAreaM2: design.useAreaM2,
    retailM2: design.floors.reduce((sum, f) => sum + (f.use === "retail" ? f.areaM2 : 0), 0),
    parkingProvided: design.parking.providedSpaces,
    parkingRequired: design.parking.requiredSpaces,
    openGroundM2: design.openSpaceM2,
    saleableM2:
      input.buildingType === "condo"
        ? design.useAreaM2 * DESIGN_ASSUMPTIONS.condoEfficiency.value
        : null,
    passCount: count(statuses, "pass"),
    failCount: count(statuses, "fail"),
    warnCount: count(statuses, "warn"),
  };
}

/** The best option to start from: the passing one with the most floor area. */
export function recommendedId<T extends { id: string; passes: boolean; gfaM2: number }>(
  designs: readonly T[],
): T["id"] | null {
  let best: T | null = null;
  for (const d of designs) {
    if (d.passes && (!best || d.gfaM2 > best.gfaM2 + 0.5)) best = d;
  }
  return best?.id ?? null;
}
