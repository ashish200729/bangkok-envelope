import { type LngLat, makeProjection, ringCentroid, type XY } from "@envelope/engine";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  clearestView,
  type Obstacle,
  type ScoredView,
  type ViewAngle,
} from "@/lib/scene/clear-view";
import { pointInRing } from "@/lib/scene/geometry";

/** Neighbours farther than this from the plot's centre cannot hide it in a plot-sized view. */
const NEAR_M = 320;
const M_PER_DEG_LAT = 111_320;

/**
 * The extruded basemap buildings near the plot, as circles with a height, from the loaded tiles.
 * Buildings standing on the plot are left out: the hider removes them. One feature id can be a
 * multipolygon of separate blocks, so every polygon counts on its own; tile buffers repeat
 * pieces, so equal circles are kept once.
 */
export function nearbyObstacles(map: MapLibreMap, plot: readonly LngLat[]): Obstacle[] {
  const origin = ringCentroid(plot);
  const projection = makeProjection(origin);
  const plotLocal = plot.map(projection.toLocal);
  const latSpan = NEAR_M / M_PER_DEG_LAT;
  const lngSpan = latSpan / Math.cos((origin[1] * Math.PI) / 180);
  const seen = new Set<string>();
  const obstacles: Obstacle[] = [];
  const features = map.querySourceFeatures("openmaptiles", { sourceLayer: "building" });
  for (const feature of features) {
    if (feature.properties?.hide_3d) continue;
    const heightM = Number(feature.properties?.render_height) || 0;
    if (heightM < 6) continue;
    const g = feature.geometry;
    const polygons =
      g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const rings of polygons) {
      const outer = rings[0];
      if (!outer || outer.length < 4) continue;
      const [lng0, lat0] = outer[0] ?? [];
      if (
        lng0 === undefined ||
        lat0 === undefined ||
        Math.abs(lng0 - origin[0]) > lngSpan ||
        Math.abs(lat0 - origin[1]) > latSpan
      ) {
        continue;
      }
      const local: XY[] = outer.map(([lng, lat]) => projection.toLocal([lng ?? 0, lat ?? 0]));
      const centre: XY = {
        x: local.reduce((s, p) => s + p.x, 0) / local.length,
        y: local.reduce((s, p) => s + p.y, 0) / local.length,
      };
      if (pointInRing(centre, plotLocal)) continue;
      let area = 0;
      for (let i = 0; i < local.length - 1; i++) {
        const a = local[i] as XY;
        const b = local[i + 1] as XY;
        area += a.x * b.y - b.x * a.y;
      }
      const radiusM = Math.sqrt(Math.abs(area / 2) / Math.PI);
      if (radiusM < 2) continue;
      const key = `${Math.round(centre.x)}:${Math.round(centre.y)}:${Math.round(heightM)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      obstacles.push({ centre, radiusM, heightM });
    }
  }
  return obstacles;
}

/** The clearest camera angle onto the plot, from the buildings loaded around it. */
export function clearViewOf(
  map: MapLibreMap,
  plot: readonly LngLat[],
  preferred: ViewAngle,
): ScoredView {
  if (plot.length < 3) return { ...preferred, score: 0 };
  const origin = ringCentroid(plot);
  const projection = makeProjection(origin);
  return clearestView(plot.map(projection.toLocal), nearbyObstacles(map, plot), preferred);
}
