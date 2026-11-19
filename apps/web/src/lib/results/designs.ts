import type { FloorUse, MultiPolygon, Polygon } from "@envelope/engine";
import type { AnyDesign as Design } from "./view";

/** A floor outline may be one polygon or, for split floors, several. */
export type Outline = Polygon | MultiPolygon;

function isMultiPolygon(outline: Outline): outline is MultiPolygon {
  return Array.isArray(outline[0]?.[0]?.[0]);
}

export function outlinePolygons(outline: Outline): readonly Polygon[] {
  return isMultiPolygon(outline) ? outline : [outline as Polygon];
}

/** RGB per floor use, shared by the 3D slabs and the panel legend. */
export const USE_RGB: Record<FloorUse, readonly [number, number, number]> = {
  parking: [128, 132, 140],
  lobby: [214, 160, 66],
  retail: [222, 112, 78],
  amenity: [96, 170, 92],
  residential: [74, 133, 214],
  office: [46, 155, 140],
  hotel: [150, 104, 196],
};

export const floorUseColor = (use: FloorUse) => `rgb(${USE_RGB[use].join(" ")})`;

export function floorUses(design: Design): FloorUse[] {
  return [...new Set(design.floors.map((floor) => floor.use))];
}

export function sumFloorAreas(design: Design): number {
  return design.floors.reduce((sum, floor) => sum + floor.areaM2, 0);
}

/**
 * Whole square metres per floor that add up to the rounded total (largest remainder), so a
 * reader summing the schedule gets the total it shows. Rounding each floor alone can be several
 * m² off over 20 floors.
 */
export function scheduleAreasM2(design: Design): number[] {
  const exact = design.floors.map((floor) => floor.areaM2);
  const whole = exact.map(Math.floor);
  let missing = Math.round(sumFloorAreas(design)) - whole.reduce((sum, a) => sum + a, 0);
  const byRemainder = exact
    .map((area, i) => ({ i, remainder: area - Math.floor(area) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const { i } of byRemainder) {
    if (missing <= 0) break;
    whole[i] = (whole[i] ?? 0) + 1;
    missing -= 1;
  }
  return whole;
}
