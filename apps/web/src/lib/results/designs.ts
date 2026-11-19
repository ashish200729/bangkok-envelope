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

/**
 * Massing colour per floor use, shared by the 3D model, the map legend and the panel legend.
 * Muted, matte tones that read against light or dark neighbours: shops warm sand, car park light
 * grey, offices soft blue-grey.
 */
export const USE_HEX: Record<FloorUse, string> = {
  parking: "#c3c6c9",
  lobby: "#cfb995",
  retail: "#dcc08f",
  amenity: "#a9c19d",
  residential: "#e6bc9f",
  office: "#9db2c6",
  hotel: "#bba6c6",
};

function hexToRgb(hex: string): readonly [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const USE_RGB = Object.fromEntries(
  Object.entries(USE_HEX).map(([use, hex]) => [use, hexToRgb(hex)]),
) as Record<FloorUse, readonly [number, number, number]>;

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
