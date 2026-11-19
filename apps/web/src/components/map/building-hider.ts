import { closeRing, type LngLat } from "@envelope/engine";
import { booleanIntersects } from "@turf/boolean-intersects";
import { polygon } from "@turf/helpers";
import type { FilterSpecification, Map as MapLibreMap } from "maplibre-gl";

const BUILDING_LAYERS = ["building", "building-3d"] as const;

/**
 * Hides basemap buildings that stand on the plot (they would be demolished) and keeps the
 * neighbours. Re-runs when new tiles arrive, because buildings load tile by tile.
 */
export function createBuildingHider(map: MapLibreMap) {
  const baseFilters = new Map(
    BUILDING_LAYERS.filter((id) => map.getLayer(id)).map((id) => [id, map.getFilter(id)]),
  );
  let vertices: readonly LngLat[] = [];
  let hidden = "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  function apply() {
    if (vertices.length < 3) return;
    const plot = polygon([closeRing(vertices).map(([lng, lat]) => [lng, lat])]);
    const ids = new Set<number | string>();
    for (const feature of map.querySourceFeatures("openmaptiles", { sourceLayer: "building" })) {
      if (feature.id !== undefined && booleanIntersects(feature, plot)) ids.add(feature.id);
    }
    const key = [...ids].sort().join(",");
    if (key === hidden) return;
    hidden = key;
    for (const [id, base] of baseFilters) {
      const notOnPlot: FilterSpecification = ["!", ["in", ["id"], ["literal", [...ids]]]];
      map.setFilter(id, (base ? ["all", base, notOnPlot] : notOnPlot) as FilterSpecification);
    }
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
    destroy() {
      clearTimeout(timer);
      map.off("sourcedata", onData);
    },
  };
}
