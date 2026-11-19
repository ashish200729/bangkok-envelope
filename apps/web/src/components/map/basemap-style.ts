import type { FilterSpecification, Map as MapLibreMap } from "maplibre-gl";

export type BasemapPalette = "light" | "dark";

type Colors = {
  background: string;
  land: string;
  park: string;
  wood: string;
  water: string;
  waterLine: string;
  casing: string;
  major: string;
  minor: string;
  path: string;
  rail: string;
  building: string;
  building3d: string;
  buildingOutline: string;
  boundary: string;
  text: string;
  textStrong: string;
  halo: string;
  transitText: string;
};

/**
 * OpenFreeMap Liberty, recoloured: quiet warm greys for an architectural look in light mode, and
 * the same layers darkened for the dark theme and night view (Liberty has no dark variant, and
 * the other OpenFreeMap styles lack 3D buildings). Colours are hex: MapLibre cannot read OKLCH.
 */
export const BASEMAP_COLORS: Record<BasemapPalette, Colors> = {
  light: {
    background: "#f3f1ec",
    land: "#eeebe4",
    park: "#dfe6d4",
    wood: "#d8e3cb",
    water: "#c6d7e3",
    waterLine: "#b4c9d9",
    casing: "#ddd9d1",
    major: "#fdfcfa",
    minor: "#ffffff",
    path: "#f8f6f1",
    rail: "#bdb9b2",
    building: "#e6e4e0",
    building3d: "#f5f4f1",
    buildingOutline: "#d2cec6",
    boundary: "#b8b4ad",
    text: "#6e6962",
    textStrong: "#3d3934",
    halo: "#f6f4f0",
    transitText: "#2c5a8c",
  },
  dark: {
    background: "#16181c",
    land: "#1a1d21",
    park: "#1c251f",
    wood: "#1d2820",
    water: "#122030",
    waterLine: "#1a2c3c",
    casing: "#2a2e34",
    major: "#363b42",
    minor: "#2c3036",
    path: "#25292e",
    rail: "#40454c",
    building: "#262a2f",
    building3d: "#30353c",
    buildingOutline: "#33383e",
    boundary: "#4c5158",
    text: "#99a0a8",
    textStrong: "#cdd2d8",
    halo: "#131518",
    transitText: "#8fbbea",
  },
};

/** Shop, café and other point-of-interest icons and names: clutter around a plot study. */
export const HIDDEN_LAYERS = [
  "poi_r20",
  "poi_r7",
  "poi_r1",
  "airport",
  "road_one_way_arrow",
  "road_one_way_arrow_opposite",
  "highway-shield-non-us",
  "highway-shield-us-interstate",
  "road_shield_us",
] as const;

/**
 * Transit points keep only rail stations: BTS and MRT stations matter for the 500 m station rule;
 * bus stops do not.
 */
const RAIL_ONLY: FilterSpecification = ["==", ["get", "class"], "rail"];

type Paint = [string, unknown][];

function paintFor(id: string, type: string, sourceLayer: string | undefined, c: Colors): Paint {
  if (type === "background") return [["background-color", c.background]];
  if (type === "symbol") {
    const strong = id.startsWith("label_") || id.startsWith("highway-name-major");
    const color = id === "poi_transit" ? c.transitText : strong ? c.textStrong : c.text;
    return [
      ["text-color", color],
      ["text-halo-color", c.halo],
    ];
  }
  if (id === "building") {
    return [
      ["fill-color", c.building],
      ["fill-outline-color", c.buildingOutline],
    ];
  }
  if (NEIGHBOUR_LAYERS.includes(id)) {
    return [
      ["fill-extrusion-color", c.building3d],
      ["fill-extrusion-opacity", neighbourOpacity],
    ];
  }
  if (sourceLayer === "transportation" && type === "line") {
    if (id.includes("rail")) return [["line-color", c.rail]];
    if (id.includes("casing")) return [["line-color", c.casing]];
    if (id.includes("path_pedestrian")) return [["line-color", c.path]];
    const minor = id.includes("minor") || id.includes("service") || id.includes("street");
    return [["line-color", minor ? c.minor : c.major]];
  }
  if (sourceLayer === "water") return [["fill-color", c.water]];
  if (sourceLayer === "waterway") return [["line-color", c.waterLine]];
  if (sourceLayer === "boundary") return [["line-color", c.boundary]];
  if (id === "park") {
    return [
      ["fill-color", c.park],
      ["fill-outline-color", c.park],
    ];
  }
  if (id === "park_outline") return [["line-color", c.park]];
  if (id === "landcover_wood" || id === "landcover_grass") return [["fill-color", c.wood]];
  if (type === "fill" && (sourceLayer === "landuse" || sourceLayer === "landcover")) {
    return [["fill-color", c.land]];
  }
  if (sourceLayer === "aeroway") return [[type === "fill" ? "fill-color" : "line-color", c.land]];
  return [];
}

/** The extruded neighbours: the basemap's own and those the building hider draws again. */
const NEIGHBOUR_LAYERS: readonly string[] = ["building-3d", "buildings-restored"];
const SOLID_OPACITY = 0.92;
/** See-through neighbours: light enough to read the plot behind them, still there as context. */
const SEE_THROUGH_OPACITY = 0.22;
let neighbourOpacity = SOLID_OPACITY;

/** Fades the surrounding buildings so a plot hidden behind towers can be seen. */
export function setNeighboursSeeThrough(map: MapLibreMap, seeThrough: boolean) {
  neighbourOpacity = seeThrough ? SEE_THROUGH_OPACITY : SOLID_OPACITY;
  for (const id of NEIGHBOUR_LAYERS) {
    if (map.getLayer(id)) map.setPaintProperty(id, "fill-extrusion-opacity", neighbourOpacity);
  }
}

/**
 * Restyles the basemap in place: hides POI clutter, keeps rail stations, road and district names,
 * and recolours every layer for the palette. Building heights are untouched. Safe to call again
 * to switch palettes; the neighbours keep their see-through setting.
 */
export function applyBasemapStyle(map: MapLibreMap, palette: BasemapPalette) {
  const colors = BASEMAP_COLORS[palette];
  // A soft, high light keeps the neighbours matte and light instead of grey on their shaded sides.
  map.setLight(
    palette === "light"
      ? { anchor: "map", position: [1.6, 225, 35], color: "#ffffff", intensity: 0.22 }
      : { anchor: "map", position: [1.6, 225, 35], color: "#c8d0dc", intensity: 0.3 },
  );
  for (const id of HIDDEN_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
  }
  if (map.getLayer("poi_transit")) map.setFilter("poi_transit", RAIL_ONLY);
  for (const layer of map.getStyle().layers ?? []) {
    const source = "source" in layer ? layer.source : undefined;
    const ours = layer.id === "buildings-restored";
    if (source !== "openmaptiles" && layer.type !== "background" && !ours) continue;
    const sourceLayer = "source-layer" in layer ? layer["source-layer"] : undefined;
    for (const [property, value] of paintFor(layer.id, layer.type, sourceLayer, colors)) {
      (map.setPaintProperty as (layer: string, name: string, value: unknown) => void).call(
        map,
        layer.id,
        property,
        value,
      );
    }
  }
}
