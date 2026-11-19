import type { Design, FloorUse, MultiPolygon, Polygon } from "@envelope/engine";

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
