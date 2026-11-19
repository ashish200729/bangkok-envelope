import type { LngLat, Road } from "@envelope/engine";
import type { GeoJSONSource, MapLayerMouseEvent, Map as MapLibreMap } from "maplibre-gl";
import { type PlotDraft, sideRole, type VertexId } from "@/lib/plot/draft";
import { formatM } from "@/lib/plot/format";
import { distanceM, isCounterClockwise, midpoint } from "@/lib/plot/geometry";
import { MAP_COLORS } from "./colors";
import { addPills, outwardBearing, PILLS, pillLayout, placeToward } from "./measure-layers";

const SOURCE = "plot-sides";
const LABEL_SOURCE = "plot-side-labels";
const HIT_LAYER = "plot-sides-hit";
export const SIDE_LABEL_LAYERS = {
  plain: "plot-sides-label",
  active: "plot-sides-label-active",
} as const;
const LAYERS = [
  "plot-sides-road",
  "plot-sides-active",
  HIT_LAYER,
  ...Object.values(SIDE_LABEL_LAYERS),
];

export type SideLayerState = {
  draft: PlotDraft;
  roads: readonly Road[];
  hoveredSide: VertexId | null;
  selectedSide: VertexId | null;
  /** Index of the corner being dragged; its two sides are highlighted. */
  draggedCorner: number | null;
};

function sideFeatures(state: SideLayerState, mapBearing: number) {
  const { vertices } = state.draft;
  const n = vertices.length;
  const ccw = isCounterClockwise(vertices.map((v) => v.lngLat));
  const lines = [];
  const labels = [];
  for (const [i, v] of vertices.entries()) {
    const next = vertices[(i + 1) % n] ?? v;
    const a: LngLat = v.lngLat;
    const b: LngLat = next.lngLat;
    const role = sideRole(state.draft, v.id);
    const road = role.kind === "road" ? state.roads.find((r) => r.id === role.roadId) : undefined;
    const dragged =
      state.draggedCorner !== null &&
      (i === state.draggedCorner || (i + 1) % n === state.draggedCorner);
    const active = dragged || v.id === state.hoveredSide || v.id === state.selectedSide;
    const length = formatM(distanceM(a, b));
    lines.push({
      type: "Feature" as const,
      properties: { id: v.id, role: role.kind, active },
      geometry: { type: "LineString" as const, coordinates: [[...a], [...b]] },
    });
    labels.push({
      type: "Feature" as const,
      properties: {
        id: v.id,
        role: role.kind,
        active,
        text: road
          ? `${road.name ?? "Road"} · ${road.widthM} m road · ${length}`
          : `${i + 1} · ${length}`,
        rank: road ? 0 : 1,
        ...placeToward(outwardBearing(a, b, ccw), mapBearing),
      },
      geometry: { type: "Point" as const, coordinates: [...midpoint(a, b)] },
    });
  }
  return {
    lines: { type: "FeatureCollection" as const, features: lines },
    labels: { type: "FeatureCollection" as const, features: labels },
  };
}

/**
 * Draws the plot's sides on the ground: road sides thick, every side labelled with its length
 * (and road), the hovered, selected or dragged sides highlighted. Uses MapLibre layers because
 * these are flat lines.
 */
export function createSideLayers(
  map: MapLibreMap,
  events: { onHover: (side: VertexId | null) => void; onSelect: (side: VertexId) => void },
) {
  addPills(map);
  const empty = { type: "FeatureCollection" as const, features: [] };
  map.addSource(SOURCE, { type: "geojson", data: empty });
  map.addSource(LABEL_SOURCE, { type: "geojson", data: empty });
  map.addLayer({
    id: "plot-sides-road",
    type: "line",
    source: SOURCE,
    filter: ["==", ["get", "role"], "road"],
    layout: { "line-cap": "round" },
    paint: { "line-color": MAP_COLORS.road, "line-width": 7, "line-opacity": 0.9 },
  });
  map.addLayer({
    id: "plot-sides-active",
    type: "line",
    source: SOURCE,
    filter: ["==", ["get", "active"], true],
    layout: { "line-cap": "round" },
    paint: { "line-color": MAP_COLORS.active, "line-width": 6 },
  });
  map.addLayer({
    id: HIT_LAYER,
    type: "line",
    source: SOURCE,
    paint: { "line-color": "#000000", "line-width": 18, "line-opacity": 0 },
  });
  map.addLayer({
    id: SIDE_LABEL_LAYERS.plain,
    type: "symbol",
    source: LABEL_SOURCE,
    minzoom: 15,
    filter: ["!=", ["get", "active"], true],
    layout: {
      ...pillLayout(PILLS.plain, ["case", ["==", ["get", "role"], "road"], 12, 11], false),
      "symbol-sort-key": ["get", "rank"],
    },
    paint: {
      "text-color": [
        "case",
        ["==", ["get", "role"], "road"],
        MAP_COLORS.road,
        MAP_COLORS.boundaryLabel,
      ],
    },
  });
  map.addLayer({
    id: SIDE_LABEL_LAYERS.active,
    type: "symbol",
    source: LABEL_SOURCE,
    filter: ["==", ["get", "active"], true],
    layout: pillLayout(PILLS.active, 12, true),
    paint: { "text-color": MAP_COLORS.ink },
  });

  const sideAt = (e: MapLayerMouseEvent) => e.features?.[0]?.properties?.id as VertexId | undefined;
  const onMove = (e: MapLayerMouseEvent) => events.onHover(sideAt(e) ?? null);
  const onLeave = () => events.onHover(null);
  const onClick = (e: MapLayerMouseEvent) => {
    const side = sideAt(e);
    if (side) events.onSelect(side);
  };
  map.on("mousemove", HIT_LAYER, onMove);
  map.on("mouseleave", HIT_LAYER, onLeave);
  map.on("click", HIT_LAYER, onClick);

  return {
    render(state: SideLayerState) {
      const { lines, labels } = sideFeatures(state, map.getBearing());
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(lines);
      (map.getSource(LABEL_SOURCE) as GeoJSONSource | undefined)?.setData(labels);
    },
    setVisible(visible: boolean) {
      for (const id of LAYERS)
        map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    },
    /** Moves the labels above Terra Draw's outline and handles. */
    raiseLabels() {
      for (const id of Object.values(SIDE_LABEL_LAYERS)) map.moveLayer(id);
    },
  };
}
