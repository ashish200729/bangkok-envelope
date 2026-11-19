import { create } from "zustand";

/** A basemap building standing on the plot today (OpenStreetMap via OpenFreeMap tiles). */
export type AsBuiltBuilding = {
  id: string;
  /** The whole building's footprint in m², from the tile geometry (tile pieces merged). */
  footprintM2: number;
  /** The part of that footprint on the plot, in m². */
  overlapM2: number;
  /** The tiles' render_height in metres (OSM height, or levels × ~3 m, or a default). */
  heightM: number;
  /** render_min_height: above 0 for an upper part (a tower on a podium). */
  baseM: number;
};

export type AsBuilt = {
  buildings: AsBuiltBuilding[];
  /** Built ground on the plot: Σ overlap of the parts that stand on the ground, in m². */
  footprintM2: number;
  /**
   * Floor area estimate on the plot: Σ overlap × round((height − base) ÷ 3.5 m) storeys (at
   * least one) over every part.
   * An estimate from map heights, to show as such.
   */
  estimatedFloorAreaM2: number;
  /** The tallest building's height, in metres. */
  heightM: number;
};

/** Storey height assumed when turning a basemap height into a storey count. */
export const AS_BUILT_STOREY_M = 3.5;

export function asBuiltStoreys(heightM: number): number {
  return Math.max(1, Math.round(heightM / AS_BUILT_STOREY_M));
}

export function asBuiltSummary(buildings: AsBuiltBuilding[]): AsBuilt {
  return {
    buildings,
    footprintM2: buildings.reduce((sum, b) => sum + (b.baseM > 0 ? 0 : b.overlapM2), 0),
    estimatedFloorAreaM2: buildings.reduce(
      (sum, b) => sum + b.overlapM2 * asBuiltStoreys(b.heightM - b.baseM),
      0,
    ),
    heightM: buildings.reduce((max, b) => Math.max(max, b.heightM), 0),
  };
}

/** What stands on the plot today, for an "as built, for comparison" row. Empty until tiles load. */
export const useAsBuilt = create<AsBuilt>()(() => asBuiltSummary([]));
