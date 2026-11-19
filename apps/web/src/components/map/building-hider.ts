import { closeRing, type LngLat, makeProjection, ringCentroid, type XY } from "@envelope/engine";
import { booleanIntersects } from "@turf/boolean-intersects";
import { polygon } from "@turf/helpers";
import { Clipper, FillRule, type PathD, type PathsD, PointInPolygonResult } from "clipper2-ts";
import type { FilterSpecification, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { type AsBuiltBuilding, asBuiltSummary, useAsBuilt } from "@/lib/scene/as-built";
import { SCENE_COLORS } from "@/lib/scene/materials";

type TileFeature = ReturnType<MapLibreMap["querySourceFeatures"]>[number];

const BUILDING_LAYERS = ["building", "building-3d"] as const;
export const AS_BUILT_LAYER = "as-built-3d";
/** Neighbours that share a tile id with an on-plot building, drawn again (see below). */
export const RESTORED_LAYER = "buildings-restored";
const AS_BUILT_SOURCE = "as-built";
const RESTORED_SOURCE = "buildings-restored";
/** A part overlapping the plot by less than this is only touching it. */
const ON_PLOT_MIN_M2 = 0.5;

type Part = { rings: XY[][]; heightM: number; baseM: number };
type FeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon>;

/**
 * Hides basemap buildings that stand on the plot (they would be demolished) and keeps the
 * neighbours. Re-runs when new tiles arrive, because buildings load tile by tile.
 *
 * Root cause of neighbours vanishing: OpenFreeMap's building ids are not unique per building. One
 * id can be a multipolygon of many separate blocks across a district (on the sample plot, id
 * 155805610 covers dozens of 5 m shophouses), and a style filter can only hide whole features.
 * So the on-plot ids are filtered out, and every part of those features that does not touch the
 * plot is drawn again from a GeoJSON source with the same style. The on-plot parts feed the
 * "as built" ghost and `useAsBuilt` (footprint and height).
 */
export function createBuildingHider(map: MapLibreMap) {
  const baseFilters = new Map(
    BUILDING_LAYERS.filter((id) => map.getLayer(id)).map((id) => [id, map.getFilter(id)]),
  );
  const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
  if (map.getLayer("building-3d") && !map.getLayer(RESTORED_LAYER)) {
    map.addSource(RESTORED_SOURCE, { type: "geojson", data: empty });
    map.addSource(AS_BUILT_SOURCE, { type: "geojson", data: empty });
    const layers = map.getStyle().layers ?? [];
    const after = layers[layers.findIndex((l) => l.id === "building-3d") + 1]?.id;
    const extrusion: {
      "fill-extrusion-height": ["get", string];
      "fill-extrusion-base": ["get", string];
    } = {
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": ["get", "base"],
    };
    map.addLayer(
      {
        id: RESTORED_LAYER,
        type: "fill-extrusion",
        source: RESTORED_SOURCE,
        minzoom: 14,
        paint: {
          ...extrusion,
          "fill-extrusion-color": map.getPaintProperty(
            "building-3d",
            "fill-extrusion-color",
          ) as string,
          "fill-extrusion-opacity": map.getPaintProperty(
            "building-3d",
            "fill-extrusion-opacity",
          ) as number,
        },
      },
      after,
    );
    map.addLayer(
      {
        id: AS_BUILT_LAYER,
        type: "fill-extrusion",
        source: AS_BUILT_SOURCE,
        layout: { visibility: "none" },
        paint: {
          ...extrusion,
          "fill-extrusion-color": SCENE_COLORS.asBuilt,
          "fill-extrusion-opacity": 0.4,
        },
      },
      after,
    );
  }
  let vertices: readonly LngLat[] = [];
  let shown = "";
  let filtered = "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  function apply() {
    if (vertices.length < 3) return;
    const plot = polygon([closeRing(vertices).map(([lng, lat]) => [lng, lat])]);
    const all = map.querySourceFeatures("openmaptiles", { sourceLayer: "building" });
    const ids = new Set<number | string>();
    for (const feature of all) {
      if (feature.id !== undefined && booleanIntersects(feature, plot)) ids.add(feature.id);
    }
    // Outlines of buildings mapped in parts carry hide_3d: the basemap never extrudes them, so
    // they are neither redrawn nor counted (their parts are).
    const pieces = all.filter((f) => f.id !== undefined && ids.has(f.id) && !f.properties?.hide_3d);
    const key = `${vertices.flat().join(",")}|${[...ids].sort().join(",")}|${pieces.length}`;
    if (key === shown) return;
    shown = key;

    const idsKey = [...ids].sort().join(",");
    if (idsKey !== filtered) {
      filtered = idsKey;
      for (const [id, base] of baseFilters) {
        const notOnPlot: FilterSpecification = ["!", ["in", ["id"], ["literal", [...ids]]]];
        map.setFilter(id, (base ? ["all", base, notOnPlot] : notOnPlot) as FilterSpecification);
      }
    }
    const projection = makeProjection(ringCentroid(vertices));
    const plotLocal: PathsD = [vertices.map(projection.toLocal)];
    const onPlot: AsBuiltBuilding[] = [];
    const asBuilt: Part[] = [];
    const restored: Part[] = [];
    for (const [groupKey, group] of groupPieces(pieces)) {
      for (const part of mergeParts(group, projection.toLocal)) {
        const overlap = Math.abs(
          Clipper.areaPathsD(Clipper.intersectD(part.rings, plotLocal, FillRule.NonZero, 3)),
        );
        if (overlap >= ON_PLOT_MIN_M2) {
          asBuilt.push(part);
          const footprintM2 = Math.abs(Clipper.areaPathsD(part.rings));
          onPlot.push({
            id: groupKey,
            footprintM2,
            heightM: part.heightM,
            baseM: part.baseM,
            overlapM2: overlap,
          });
        } else {
          restored.push(part);
        }
      }
    }
    const toGeoJson = (parts: Part[]): FeatureCollection => ({
      type: "FeatureCollection",
      features: parts.map((part) => ({
        type: "Feature",
        properties: { height: part.heightM, base: part.baseM },
        geometry: {
          type: "Polygon",
          coordinates: part.rings.map((ring) =>
            [...ring, ring[0] as XY].map((p) => [...projection.toLngLat(p)]),
          ),
        },
      })),
    });
    (map.getSource(RESTORED_SOURCE) as GeoJSONSource | undefined)?.setData(toGeoJson(restored));
    (map.getSource(AS_BUILT_SOURCE) as GeoJSONSource | undefined)?.setData(toGeoJson(asBuilt));
    useAsBuilt.setState(asBuiltSummary(onPlot), true);
  }

  function schedule(delayMs: number) {
    clearTimeout(timer);
    timer = setTimeout(apply, delayMs);
  }

  const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (e.sourceId === "openmaptiles" && e.isSourceLoaded) schedule(150);
  };
  map.on("sourcedata", onData);

  return {
    update(next: readonly LngLat[]) {
      vertices = next;
      schedule(60);
    },
    setAsBuiltVisible(visible: boolean) {
      if (map.getLayer(AS_BUILT_LAYER)) {
        map.setLayoutProperty(AS_BUILT_LAYER, "visibility", visible ? "visible" : "none");
      }
    },
    destroy() {
      clearTimeout(timer);
      map.off("sourcedata", onData);
    },
  };
}

/** Pieces of one feature (same id and heights) from every loaded tile. */
function groupPieces(pieces: TileFeature[]): Map<string, TileFeature[]> {
  const groups = new Map<string, TileFeature[]>();
  for (const piece of pieces) {
    const key = `${piece.id}:${piece.properties?.render_height}:${piece.properties?.render_min_height}`;
    const group = groups.get(key) ?? [];
    group.push(piece);
    groups.set(key, group);
  }
  return groups;
}

/**
 * Tiles cut a feature at their edges and repeat it in their buffers; the union of its pieces is
 * the real footprint, split into separate parts (outer ring with the holes inside it).
 */
function mergeParts(group: TileFeature[], toLocal: (p: LngLat) => XY): Part[] {
  const first = group[0];
  const heightM = Number(first?.properties?.render_height) || 0;
  const baseM = Number(first?.properties?.render_min_height) || 0;
  const paths: PathsD = [];
  for (const piece of group) {
    const geometry = piece.geometry;
    const polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.type === "MultiPolygon"
          ? geometry.coordinates
          : [];
    for (const rings of polygons) {
      // Even-odd per polygon orients its rings (holes cut); pieces then merge non-zero, so a piece
      // repeated in two tiles' buffers counts once.
      const local = rings.map((ring) => ring.map(([lng, lat]) => toLocal([lng ?? 0, lat ?? 0])));
      paths.push(...Clipper.unionD(local, FillRule.EvenOdd));
    }
  }
  const merged = Clipper.unionD(paths, FillRule.NonZero);
  const outers = merged.filter((p) => Clipper.areaD(p) > 0);
  const holes = merged.filter((p) => Clipper.areaD(p) < 0);
  return outers.map((outer) => ({
    rings: [
      outer,
      ...holes.filter(
        (h) => h[0] && Clipper.pointInPolygonD(h[0], outer) === PointInPolygonResult.IsInside,
      ),
    ] as PathD[] as XY[][],
    heightM,
    baseM,
  }));
}
