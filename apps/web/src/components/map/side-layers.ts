import type { Road } from "@envelope/engine";
import type { GeoJSONSource, MapLayerMouseEvent, Map as MapLibreMap } from "maplibre-gl";
import { type PlotDraft, sideRole, type VertexId } from "@/lib/plot/draft";
import { MAP_COLORS, MAP_FONT } from "./colors";

const SOURCE = "plot-sides";
const HIT_LAYER = "plot-sides-hit";

type SideFeatureProps = {
  id: VertexId;
  role: "road" | "boundary";
  active: boolean;
  label: string;
};

export type SideLayerState = {
  draft: PlotDraft;
  roads: readonly Road[];
  hoveredSide: VertexId | null;
  selectedSide: VertexId | null;
};

function sideFeatures(state: SideLayerState) {
  const { vertices } = state.draft;
  return {
    type: "FeatureCollection" as const,
    features: vertices.map((v, i) => {
      const next = vertices[(i + 1) % vertices.length] ?? v;
      const role = sideRole(state.draft, v.id);
      const road = role.kind === "road" ? state.roads.find((r) => r.id === role.roadId) : undefined;
      const properties: SideFeatureProps = {
        id: v.id,
        role: role.kind,
        active: v.id === state.hoveredSide || v.id === state.selectedSide,
        label: road ? `${road.name ?? "Road"} · ${road.widthM} m` : String(i + 1),
      };
      return {
        type: "Feature" as const,
        properties,
        geometry: { type: "LineString" as const, coordinates: [[...v.lngLat], [...next.lngLat]] },
      };
    }),
  };
}

/**
 * Draws the plot's sides on the ground: road sides thick and labelled with their width, the
 * hovered or selected side highlighted. Uses MapLibre layers because these are flat lines.
 */
export function createSideLayers(
  map: MapLibreMap,
  events: { onHover: (side: VertexId | null) => void; onSelect: (side: VertexId) => void },
) {
  map.addSource(SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
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
    id: "plot-sides-label",
    type: "symbol",
    source: SOURCE,
    layout: {
      "symbol-placement": "line-center",
      "text-field": ["get", "label"],
      "text-font": MAP_FONT,
      "text-size": ["case", ["==", ["get", "role"], "road"], 13, 11],
      "text-offset": [0, -1.1],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": [
        "case",
        ["==", ["get", "role"], "road"],
        MAP_COLORS.road,
        MAP_COLORS.boundaryLabel,
      ],
      "text-halo-color": MAP_COLORS.halo,
      "text-halo-width": 2,
    },
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
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(sideFeatures(state));
    },
    setVisible(visible: boolean) {
      for (const id of ["plot-sides-road", "plot-sides-active", HIT_LAYER, "plot-sides-label"]) {
        map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      }
    },
  };
}
