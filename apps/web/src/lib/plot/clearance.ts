import type { AsBuiltBuilding } from "@/lib/scene/as-built";

/**
 * A plot drawn over buildings that stand there today is a redevelopment site: the rules assume
 * those buildings are demolished, so the user has to say so before anything is checked. Map data
 * is slightly misaligned, so a sliver along a neighbour's wall does not count: a building counts
 * when the plot covers at least `MIN_OVERLAP_M2` of it, or at least `MIN_SHARE` of a small one.
 */
export const CLEARANCE_MIN_OVERLAP_M2 = 25;
export const CLEARANCE_MIN_SHARE = 0.25;
/** Below this, even a whole building is a shed or a mapping error. */
export const CLEARANCE_MIN_SMALL_M2 = 5;

export type Clearance = {
  /** Buildings the plot covers enough of to count; parts of one tower share an id prefix. */
  buildings: AsBuiltBuilding[];
  /** Built ground on the plot (parts standing on the ground), in m². */
  groundM2: number;
  tallestM: number;
};

export function countsAsCovered(b: Pick<AsBuiltBuilding, "overlapM2" | "footprintM2">): boolean {
  if (b.overlapM2 >= CLEARANCE_MIN_OVERLAP_M2) return true;
  return (
    b.overlapM2 >= CLEARANCE_MIN_SMALL_M2 &&
    b.footprintM2 > 0 &&
    b.overlapM2 / b.footprintM2 >= CLEARANCE_MIN_SHARE
  );
}

export function clearanceFor(buildings: readonly AsBuiltBuilding[]): Clearance {
  const covered = buildings.filter(countsAsCovered);
  return {
    buildings: covered,
    groundM2: covered.reduce((sum, b) => sum + (b.baseM > 0 ? 0 : b.overlapM2), 0),
    tallestM: covered.reduce((max, b) => Math.max(max, b.heightM), 0),
  };
}

/** Separate buildings, counting a tower and its podium (same tile id) once. */
export function buildingCount(clearance: Clearance): number {
  return new Set(clearance.buildings.map((b) => b.id.split(":")[0])).size;
}

export type SiteHold =
  | { held: false }
  | { held: true; reason: "checking" }
  | { held: true; reason: "buildings"; clearance: Clearance };

/**
 * Whether results wait for the user. Right after a plot is drawn they wait for the map to report
 * what stands on it ("checking"); then, if it covers buildings, for the user to confirm they will
 * be demolished. A confirmation holds until another plot is drawn.
 */
export function siteHold(
  site: { siteCheck: "checking" | "done"; demolitionConfirmed: boolean },
  buildings: readonly AsBuiltBuilding[],
): SiteHold {
  if (site.siteCheck === "checking") return { held: true, reason: "checking" };
  if (site.demolitionConfirmed) return { held: false };
  const clearance = clearanceFor(buildings);
  return clearance.buildings.length > 0
    ? { held: true, reason: "buildings", clearance }
    : { held: false };
}
