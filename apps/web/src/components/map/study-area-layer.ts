import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { getStudyArea } from "@/lib/site/client";
import { MAP_COLORS } from "./colors";

const SOURCE = "site-study-area";
const LAYER = "site-study-area-line";

/**
 * The outline of the area with site data, as a thin dashed line. Added before the plot layers so
 * it stays beneath them; the outline arrives later and only fills the source.
 */
export function createStudyAreaLayer(map: MapLibreMap): () => void {
  map.addSource(SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: LAYER,
    type: "line",
    source: SOURCE,
    paint: {
      "line-color": MAP_COLORS.boundaryLabel,
      "line-width": 1.25,
      "line-opacity": 0.8,
      "line-dasharray": [3, 2],
    },
  });
  let live = true;
  getStudyArea().then(
    (area) => {
      if (!live) return;
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: area.outline },
      });
    },
    () => undefined,
  );
  return () => {
    live = false;
  };
}
