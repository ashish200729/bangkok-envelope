import { closeRing, type LngLat } from "@envelope/engine";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  type GeoJSONStoreFeatures,
  TerraDraw,
  TerraDrawModeUndoRedo,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
  ValidateMinAreaSquareMeters,
  ValidateNotSelfIntersecting,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { openRing, sameLngLat } from "@/lib/plot/draft";
import type { MapMode } from "@/lib/plot/store";
import { MAP_COLORS } from "./colors";
import { type DrawProgress, NO_PROGRESS } from "./measure-layers";

/** Smallest plot accepted while drawing; anything below cannot hold a building. */
const MIN_PLOT_AREA_M2 = 50;

type Handlers = {
  /**
   * A corner or the whole plot moved, or a corner was inserted or deleted. `draggedCorner` is
   * the index of the one corner that moved, if only one did.
   */
  onEdit: (ring: LngLat[], draggedCorner: number | null) => void;
  /** A drag, insert or delete in edit mode ended. */
  onEditEnd: () => void;
  /** The polygon being drawn changed: a corner was placed or removed, or the pointer moved. */
  onDrawProgress: (progress: DrawProgress) => void;
  /** A new plot was drawn and closed. */
  onDrawn: (ring: LngLat[]) => void;
  onRejected: (message: string) => void;
};

export type DrawController = {
  loadPlot: (vertices: readonly LngLat[]) => void;
  setMode: (mode: MapMode) => void;
  /** Removes the last corner placed while drawing; false if there is none. */
  removeLastCorner: () => boolean;
  destroy: () => void;
  /** For development and tests only. */
  debug: () => { mode: string; features: GeoJSONStoreFeatures[] };
};

/** Index of the only corner that differs between two outlines of equal length, or null. */
function movedCorner(prev: readonly LngLat[], next: readonly LngLat[]): number | null {
  if (prev.length !== next.length) return null;
  const moved = next.flatMap((p, i) => (prev[i] && sameLngLat(p, prev[i]) ? [] : [i]));
  return moved.length === 1 ? (moved[0] ?? null) : null;
}

function polygonRing(feature: GeoJSONStoreFeatures | undefined): LngLat[] | null {
  if (feature?.geometry.type !== "Polygon") return null;
  const ring = feature.geometry.coordinates[0];
  return ring ? ring.map(([lng, lat]) => [lng, lat] as LngLat) : null;
}

/** Owns Terra Draw: the editable plot outline on the map. Call after the map style loads. */
export function createDrawController(map: MapLibreMap, handlers: Handlers): DrawController {
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map }),
    modes: [
      new TerraDrawPolygonMode({
        validation: (feature, { updateType }) => {
          if (updateType !== "finish") return { valid: true };
          const notCrossing = ValidateNotSelfIntersecting(feature);
          if (!notCrossing.valid) {
            handlers.onRejected(
              "The outline crosses itself. Place the corners in order around the plot.",
            );
            return notCrossing;
          }
          const bigEnough = ValidateMinAreaSquareMeters(feature, MIN_PLOT_AREA_M2);
          if (!bigEnough.valid) {
            handlers.onRejected(`A plot needs at least ${MIN_PLOT_AREA_M2} m².`);
          }
          return bigEnough;
        },
        styles: {
          fillColor: MAP_COLORS.plotFill,
          fillOpacity: 0.18,
          outlineColor: MAP_COLORS.primary,
          outlineWidth: 2,
          closingPointColor: MAP_COLORS.white,
          closingPointOutlineColor: MAP_COLORS.primary,
          closingPointWidth: 6,
          closingPointOutlineWidth: 2,
        },
      }),
      new TerraDrawSelectMode({
        allowManualDeselection: false,
        flags: {
          polygon: {
            feature: {
              draggable: true,
              selfIntersectable: false,
              coordinates: { draggable: true, midpoints: { draggable: true }, deletable: true },
            },
          },
        },
        styles: {
          selectedPolygonColor: MAP_COLORS.plotFill,
          selectedPolygonFillOpacity: 0.16,
          selectedPolygonOutlineColor: MAP_COLORS.primary,
          selectedPolygonOutlineWidth: 2,
          selectionPointColor: MAP_COLORS.white,
          selectionPointOutlineColor: MAP_COLORS.primary,
          selectionPointWidth: 6,
          selectionPointOutlineWidth: 2,
          midPointColor: MAP_COLORS.primaryLight,
          midPointOutlineColor: MAP_COLORS.white,
          midPointWidth: 4,
          midPointOutlineWidth: 1,
        },
      }),
    ],
    undoRedo: { modeLevel: new TerraDrawModeUndoRedo() },
  });
  draw.start();

  let frame = 0;
  // Terra Draw 1.39 does not tag its change events with their origin, so changes we make
  // ourselves (loading a plot) are muted with this flag to avoid echoing them back.
  let applying = false;
  let lastEdit: LngLat[] = [];
  const readPlot = () => polygonRing(draw.getSnapshot().find((f) => f.geometry.type === "Polygon"));

  // Terra Draw keeps the unfinished polygon as [placed..., pointer, first] and counts the
  // placed corners in its properties.
  const readProgress = (): DrawProgress => {
    const feature = draw
      .getSnapshot()
      .find((f) => f.geometry.type === "Polygon" && f.properties.currentlyDrawing);
    const ring = polygonRing(feature);
    if (!feature || !ring) return NO_PROGRESS;
    const placed = Number(feature.properties.committedCoordinateCount ?? 0);
    const provisional = Number(feature.properties.provisionalCoordinateCount ?? placed);
    return {
      placed: ring.slice(0, placed),
      cursor: provisional > placed ? (ring[placed] ?? null) : null,
    };
  };

  const nextFrame = (task: () => void) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(task);
  };

  const readEdit = () => {
    const ring = readPlot();
    if (!ring) return;
    const open = openRing(ring);
    const dragged = movedCorner(lastEdit, open);
    lastEdit = open;
    handlers.onEdit(ring, dragged);
  };

  draw.on("change", (_ids, type) => {
    if (applying) return;
    const mode = draw.getMode();
    if (mode === "polygon") {
      nextFrame(() => handlers.onDrawProgress(readProgress()));
    } else if (mode === "select" && type === "update") {
      nextFrame(readEdit);
    }
  });

  draw.on("finish", (id, context) => {
    if (context.mode === "select") {
      nextFrame(() => {
        readEdit();
        handlers.onEditEnd();
      });
      return;
    }
    if (context.mode !== "polygon") return;
    cancelAnimationFrame(frame);
    const ring = polygonRing(draw.getSnapshotFeature(id));
    if (!ring) return;
    const others = draw
      .getSnapshot()
      .flatMap((f) => (f.id !== undefined && f.id !== id ? [f.id] : []));
    if (others.length) draw.removeFeatures(others);
    draw.setMode("select");
    draw.selectFeature(id);
    lastEdit = openRing(ring);
    handlers.onDrawn(ring);
  });

  return {
    loadPlot(vertices) {
      applying = true;
      try {
        draw.setMode("select");
        draw.clear();
        lastEdit = [...vertices];
        if (vertices.length < 3) return;
        const [result] = draw.addFeatures([
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [closeRing(vertices).map(([lng, lat]) => [lng, lat])],
            },
            properties: { mode: "polygon" },
          },
        ]);
        if (result?.valid && result.id !== undefined) draw.selectFeature(result.id);
      } finally {
        applying = false;
      }
    },
    setMode(mode) {
      if (mode === "draw") {
        draw.clear();
        draw.setMode("polygon");
        handlers.onDrawProgress(NO_PROGRESS);
      } else if (draw.getMode() !== "select") {
        draw.setMode("select");
      }
    },
    removeLastCorner() {
      return draw.getMode() === "polygon" && draw.canUndo() && draw.undo();
    },
    debug() {
      return { mode: draw.getMode(), features: draw.getSnapshot() };
    },
    destroy() {
      cancelAnimationFrame(frame);
      draw.stop();
    },
  };
}
