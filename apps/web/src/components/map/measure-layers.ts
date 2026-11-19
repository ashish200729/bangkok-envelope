import type { LngLat } from "@envelope/engine";
import type { GeoJSONSource, Map as MapLibreMap, SymbolLayerSpecification } from "maplibre-gl";
import { sameLngLat } from "@/lib/plot/draft";
import { formatDeg, formatM } from "@/lib/plot/format";
import {
  bearingDeg,
  distanceM,
  interiorAnglesDeg,
  isCounterClockwise,
  midpoint,
} from "@/lib/plot/geometry";
import { MAP_COLORS, MAP_FONT } from "./colors";

/** Corners sharper than this are almost always a misplaced click. */
export const SHARP_ANGLE_DEG = 15;

/** The polygon being drawn: corners placed so far and the pointer, if it is over the map. */
export type DrawProgress = { placed: readonly LngLat[]; cursor: LngLat | null };
export const NO_PROGRESS: DrawProgress = { placed: [], cursor: null };

/** A corner of the finished plot being dragged. */
export type CornerDrag = { vertices: readonly LngLat[]; index: number };

/** The outline as drawn right now: placed corners plus the pointer, unless it rests on a corner. */
export function drawOutline({ placed, cursor }: DrawProgress): readonly LngLat[] {
  const first = placed[0];
  const last = placed[placed.length - 1];
  if (!cursor || !first || !last || sameLngLat(cursor, first) || sameLngLat(cursor, last)) {
    return placed;
  }
  return [...placed, cursor];
}

const ANCHORS = [
  "bottom",
  "bottom-left",
  "left",
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
] as const;

/**
 * Anchors a label so it sits beside its point in the direction of `bearing` (degrees from
 * north), with the map's own rotation taken out.
 */
export function placeToward(bearing: number, mapBearing: number, em = 0.4) {
  const screen = (((bearing - mapBearing) % 360) + 360) % 360;
  const rad = (screen * Math.PI) / 180;
  return {
    anchor: ANCHORS[Math.round(screen / 45) % 8] ?? "center",
    offset: [Math.sin(rad) * em, -Math.cos(rad) * em] as [number, number],
  };
}

/** Bearing from each corner into the outline, halfway between its two sides. */
function insideBearings(vertices: readonly LngLat[], angles: readonly number[]): number[] {
  const n = vertices.length;
  const ccw = isCounterClockwise(vertices);
  return vertices.map((v, i) => {
    const toward = vertices[(ccw ? i - 1 + n : i + 1) % n] ?? v;
    return bearingDeg(v, toward) + (angles[i] ?? 0) / 2;
  });
}

/** Bearing from a side's midpoint away from the outline. */
export function outwardBearing(a: LngLat, b: LngLat, ccw: boolean): number {
  return bearingDeg(a, b) + (ccw ? 90 : -90);
}

type Kind = "length" | "live" | "angle" | "closing";
type Feature = GeoJSON.Feature<GeoJSON.Point | GeoJSON.LineString>;

function point(kind: Kind, at: LngLat, text: string, toward: number, mapBearing: number, em = 0.4) {
  return {
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [...at] },
    properties: { kind, text, ...placeToward(toward, mapBearing, em) },
  };
}

function drawingFeatures(progress: DrawProgress, mapBearing: number): Feature[] {
  const { placed } = progress;
  const outline = drawOutline(progress);
  const ccw = isCounterClockwise(outline);
  const features: Feature[] = [];
  const sideLabel = (kind: Kind, a: LngLat, b: LngLat, text: string) =>
    point(kind, midpoint(a, b), text, outwardBearing(a, b, ccw), mapBearing);

  for (let i = 0; i + 1 < placed.length; i++) {
    const a = placed[i] as LngLat;
    const b = placed[i + 1] as LngLat;
    features.push(sideLabel("length", a, b, formatM(distanceM(a, b))));
  }
  const last = placed[placed.length - 1];
  const cursor = outline.length > placed.length ? outline[outline.length - 1] : undefined;
  if (last && cursor) {
    const text = `${formatM(distanceM(last, cursor))} · ${formatDeg(bearingDeg(last, cursor))}`;
    features.push(sideLabel("live", last, cursor, text));
  }
  const first = outline[0];
  const end = outline[outline.length - 1];
  if (outline.length >= 3 && first && end) {
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[...end], [...first]] },
      properties: { kind: "closing" },
    });
    features.push(sideLabel("length", end, first, formatM(distanceM(end, first))));
  }
  if (placed.length >= 3) {
    const angles = interiorAnglesDeg(outline);
    const inside = insideBearings(outline, angles);
    placed.forEach((corner, i) => {
      const angle = angles[i] ?? Number.NaN;
      if (Number.isNaN(angle)) return;
      const feature = point("angle", corner, formatDeg(angle), inside[i] ?? 0, mapBearing, 0.6);
      features.push({
        ...feature,
        properties: { ...feature.properties, sharp: angle < SHARP_ANGLE_DEG },
      });
    });
  }
  return features;
}

function dragFeatures({ vertices, index }: CornerDrag, mapBearing: number): Feature[] {
  const corner = vertices[index];
  const angle = interiorAnglesDeg(vertices)[index];
  if (!corner || angle === undefined || Number.isNaN(angle)) return [];
  const inside = insideBearings(vertices, interiorAnglesDeg(vertices))[index] ?? 0;
  const text = angle < SHARP_ANGLE_DEG ? `${formatDeg(angle)} · sharp` : formatDeg(angle);
  return [point("live", corner, text, inside, mapBearing, 0.9)];
}

const PILL_RADIUS = 5;
const PILL_SIZE = 24;
const PILL_INSET = 3;

/** A rounded label background that MapLibre stretches around the text (icon-text-fit). */
export function addPill(map: MapLibreMap, id: string, fill: string, stroke: string) {
  if (map.hasImage(id)) return;
  const ratio = 2;
  const px = PILL_SIZE * ratio;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = ratio;
  ctx.beginPath();
  ctx.roundRect(ratio / 2, ratio / 2, px - ratio, px - ratio, PILL_RADIUS * ratio);
  ctx.fill();
  ctx.stroke();
  const r = PILL_RADIUS * ratio;
  const inset = PILL_INSET * ratio;
  map.addImage(id, ctx.getImageData(0, 0, px, px), {
    pixelRatio: ratio,
    stretchX: [[r, px - r]],
    stretchY: [[r, px - r]],
    content: [inset, inset, px - inset, px - inset],
  });
}

export const PILLS = {
  plain: "measure-pill",
  live: "measure-pill-live",
  active: "measure-pill-active",
};

export function addPills(map: MapLibreMap) {
  addPill(map, PILLS.plain, MAP_COLORS.white, MAP_COLORS.pillBorder);
  addPill(map, PILLS.live, MAP_COLORS.primary, MAP_COLORS.primary);
  addPill(map, PILLS.active, MAP_COLORS.activeFill, MAP_COLORS.active);
}

/** Layout shared by every pill label: text fitted into a pill, anchored per feature. */
type SymbolLayout = NonNullable<SymbolLayerSpecification["layout"]>;

export function pillLayout(
  image: string,
  size: SymbolLayout["text-size"],
  overlap: boolean,
): SymbolLayout {
  return {
    "icon-image": image,
    "icon-text-fit": "both",
    "icon-text-fit-padding": [2, 5, 2, 5],
    "icon-allow-overlap": overlap,
    "text-allow-overlap": overlap,
    "text-field": ["get", "text"],
    "text-font": MAP_FONT,
    "text-size": size,
    "text-anchor": ["get", "anchor"],
    "text-offset": ["get", "offset"],
    "text-padding": 4,
    "text-max-width": 40,
  };
}

const SOURCE = "plot-measure";
export const MEASURE_LAYER_IDS = {
  closing: "plot-measure-closing",
  angle: "plot-measure-angle",
  length: "plot-measure-length",
  live: "plot-measure-live",
} as const;

/**
 * Live measurements on the map: while drawing, the length of each side, the side under the
 * pointer with its compass bearing, the closing side and each corner's angle; while editing,
 * the angle of the corner being dragged.
 */
export function createMeasureLayers(map: MapLibreMap) {
  addPills(map);
  map.addSource(SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: MEASURE_LAYER_IDS.closing,
    type: "line",
    source: SOURCE,
    filter: ["==", ["get", "kind"], "closing"],
    paint: { "line-color": MAP_COLORS.white, "line-width": 2, "line-dasharray": [2, 2] },
  });
  map.addLayer({
    id: MEASURE_LAYER_IDS.angle,
    type: "symbol",
    source: SOURCE,
    minzoom: 16,
    filter: ["==", ["get", "kind"], "angle"],
    layout: {
      "text-field": ["get", "text"],
      "text-font": MAP_FONT,
      "text-size": ["case", ["get", "sharp"], 13, 11],
      "text-anchor": ["get", "anchor"],
      "text-offset": ["get", "offset"],
      "text-padding": 2,
    },
    paint: {
      "text-color": ["case", ["get", "sharp"], MAP_COLORS.fail, MAP_COLORS.ink],
      "text-halo-color": MAP_COLORS.halo,
      "text-halo-width": 1.5,
    },
  });
  map.addLayer({
    id: MEASURE_LAYER_IDS.length,
    type: "symbol",
    source: SOURCE,
    minzoom: 15,
    filter: ["==", ["get", "kind"], "length"],
    layout: pillLayout(PILLS.plain, 12, false),
    paint: { "text-color": MAP_COLORS.ink },
  });
  map.addLayer({
    id: MEASURE_LAYER_IDS.live,
    type: "symbol",
    source: SOURCE,
    filter: ["==", ["get", "kind"], "live"],
    layout: pillLayout(PILLS.live, 13, true),
    paint: { "text-color": MAP_COLORS.white },
  });

  let show: (mapBearing: number) => Feature[] = () => [];
  const render = () =>
    (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: show(map.getBearing()),
    });
  map.on("rotate", render);

  return {
    showDrawing(progress: DrawProgress | null) {
      show = progress ? (b) => drawingFeatures(progress, b) : () => [];
      render();
    },
    showCornerDrag(drag: CornerDrag | null) {
      show = drag ? (b) => dragFeatures(drag, b) : () => [];
      render();
    },
    /** Moves the measurements above Terra Draw's layers, keeping the closing line under its corners. */
    raise() {
      map.moveLayer(MEASURE_LAYER_IDS.closing, map.getLayer("td-point") ? "td-point" : undefined);
      for (const id of [
        MEASURE_LAYER_IDS.angle,
        MEASURE_LAYER_IDS.length,
        MEASURE_LAYER_IDS.live,
      ]) {
        map.moveLayer(id);
      }
    },
    destroy() {
      map.off("rotate", render);
    },
  };
}
