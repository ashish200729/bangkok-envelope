"use client";

import type { LngLat } from "@envelope/engine";
import { Button } from "@envelope/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@envelope/ui/components/tooltip";
import { Box, Focus, Square } from "lucide-react";
import {
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type SceneHover, SceneTooltip } from "@/components/results/scene-tooltip";
import { startEngine, useEngineStore } from "@/lib/engine/store";
import { usePlotStore } from "@/lib/plot/store";
import { fixtureFlag } from "@/lib/results/fixtures";
import { sceneFor } from "@/lib/results/scene";
import { useResultsView } from "@/lib/results/view";
import { createBuildingHider } from "./building-hider";
import { createDrawController, type DrawController } from "./draw-controller";
import { DrawHud } from "./draw-hud";
import { createSceneLayers, type SceneLayersView } from "./envelope-layers";
import { createMeasureLayers, type DrawProgress, NO_PROGRESS } from "./measure-layers";
import { createSideLayers } from "./side-layers";
import { createStudyAreaLayer } from "./study-area-layer";

setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const PITCH_3D = 55;
const EMPTY_IMAGE = { width: 1, height: 1, data: new Uint8Array(4) };

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

type MapStatus = { state: "loading" } | { state: "ready" } | { state: "failed"; message: string };

function fitToPlot(map: MapLibreMap, vertices: readonly LngLat[], animate: boolean) {
  if (vertices.length === 0) return;
  const bounds = new LngLatBounds();
  for (const [lng, lat] of vertices) bounds.extend([lng, lat]);
  map.fitBounds(bounds, {
    padding: { top: 120, bottom: 120, left: 120, right: 120 },
    maxZoom: 18,
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    duration: animate && !reducedMotion() ? 700 : 0,
  });
}

export default function PlotMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<DrawController | null>(null);
  const [progress, setProgress] = useState<DrawProgress>(NO_PROGRESS);
  const [status, setStatus] = useState<MapStatus>({ state: "loading" });
  const [is3d, setIs3d] = useState(true);
  const [hover, setHover] = useState<SceneHover | null>(null);
  const mode = usePlotStore((s) => s.mode);

  useEffect(() => {
    if (!container.current) return;
    const store = usePlotStore;
    const initial = store.getState();

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: container.current,
        style: STYLE_URL,
        center: initial.draft.vertices[0]?.lngLat as [number, number] | undefined,
        zoom: 17,
        pitch: PITCH_3D,
        bearing: -20,
        maxPitch: 75,
        canvasContextAttributes: { antialias: true },
        fadeDuration: reducedMotion() ? 0 : 300,
        attributionControl: { compact: true },
      });
    } catch (error) {
      setStatus({
        state: "failed",
        message:
          error instanceof Error && error.name === "GPUInitializationError"
            ? "This browser cannot show the 3D map (WebGL 2 is not available). Try a recent Chrome, Edge, Firefox or Safari."
            : "The map could not start. Reload the page to try again.",
      });
      return;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    map.setMissingStyleImageResolver((id) => {
      map.addImage(id, EMPTY_IMAGE);
    });

    const cleanups: (() => void)[] = [];

    map.on("load", () => {
      cleanups.push(createStudyAreaLayer(map));
      const sides = createSideLayers(map, {
        onHover: (side) => store.getState().setHoveredSide(side),
        onSelect: (side) => store.getState().setSelectedSide(side),
      });
      const measure = createMeasureLayers(map);
      const hider = createBuildingHider(map);
      let draggedCorner: number | null = null;
      const draw = createDrawController(map, {
        onEdit: (ring, dragged) => {
          draggedCorner = dragged;
          store.getState().applyMapGeometry(ring);
          const vertices = store.getState().draft.vertices.map((v) => v.lngLat);
          measure.showCornerDrag(dragged === null ? null : { vertices, index: dragged });
        },
        onEditEnd: () => {
          draggedCorner = null;
          measure.showCornerDrag(null);
          render();
        },
        onDrawProgress: (next) => {
          if (store.getState().mode !== "draw") return;
          measure.showDrawing(next);
          setProgress(next);
        },
        onDrawn: (ring) => {
          store.getState().finishDrawing(ring);
          toast.success("Plot drawn. Now mark the side that faces a road.");
        },
        onRejected: (message) => toast.error(message),
      });
      sides.raiseLabels();
      measure.raise();

      const scene = createSceneLayers(map, { onHover: setHover });
      const useFixtures = fixtureFlag();
      let shown: SceneLayersView = { envelope: null, design: null };
      const renderScene = () => {
        const next = sceneFor(
          useEngineStore.getState().state,
          useResultsView.getState(),
          useFixtures,
        );
        const view: SceneLayersView =
          next && store.getState().mode === "edit"
            ? { envelope: next.envelope, design: next.design }
            : { envelope: null, design: null };
        if (
          view.envelope?.envelope === shown.envelope?.envelope &&
          view.envelope?.kind === shown.envelope?.kind &&
          view.design === shown.design
        ) {
          return;
        }
        shown = view;
        scene.update(view);
      };
      startEngine();
      renderScene();

      const render = () => {
        const s = store.getState();
        sides.render({ ...s, draggedCorner });
        sides.setVisible(s.mode === "edit");
        hider.update(s.draft.vertices.map((v) => v.lngLat));
      };

      draw.loadPlot(initial.draft.vertices.map((v) => v.lngLat));
      fitToPlot(
        map,
        initial.draft.vertices.map((v) => v.lngLat),
        false,
      );
      render();

      const unsubscribe = store.subscribe((s, prev) => {
        if (s.geometryRevision !== prev.geometryRevision) {
          const vertices = s.draft.vertices.map((v) => v.lngLat);
          draw.loadPlot(vertices);
          fitToPlot(map, vertices, true);
        }
        if (s.mode !== prev.mode) {
          measure.showDrawing(null);
          setProgress(NO_PROGRESS);
          draw.setMode(s.mode);
        }
        if (
          s.draft !== prev.draft ||
          s.roads !== prev.roads ||
          s.hoveredSide !== prev.hoveredSide ||
          s.selectedSide !== prev.selectedSide ||
          s.mode !== prev.mode
        ) {
          render();
        }
      });

      map.on("rotate", render);
      drawRef.current = draw;
      cleanups.push(
        unsubscribe,
        useEngineStore.subscribe(renderScene),
        useResultsView.subscribe(renderScene),
        () => scene.destroy(),
        () => map.off("rotate", render),
        () => measure.destroy(),
        () => draw.destroy(),
        () => hider.destroy(),
      );
      setStatus({ state: "ready" });

      if (process.env.NODE_ENV !== "production") {
        Object.assign(window, { __envelopeMap: map, __envelopeDraw: draw });
      }
    });

    map.on("error", (event) => console.error("map:", event.error?.message ?? event));

    return () => {
      for (const cleanup of cleanups) cleanup();
      mapRef.current = null;
      drawRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (mode !== "draw") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") usePlotStore.getState().cancelDrawing();
      if (e.key === "Backspace" && !isTyping(e.target) && drawRef.current?.removeLastCorner()) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  function toggle3d() {
    const map = mapRef.current;
    if (!map) return;
    const next = !is3d;
    setIs3d(next);
    map.easeTo({
      pitch: next ? PITCH_3D : 0,
      bearing: next ? -20 : 0,
      duration: reducedMotion() ? 0 : 600,
    });
  }

  function refit() {
    const map = mapRef.current;
    if (map)
      fitToPlot(
        map,
        usePlotStore.getState().draft.vertices.map((v) => v.lngLat),
        true,
      );
  }

  return (
    <div className="relative h-full w-full bg-muted">
      <div ref={container} className="h-full w-full" data-testid="plot-map" />

      {status.state === "ready" && (
        <div className="absolute top-3 left-3 flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                onClick={refit}
                aria-label="Fit the plot in view"
              >
                <Focus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fit the plot in view</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                onClick={toggle3d}
                aria-label={is3d ? "Switch to a flat 2D view" : "Switch to a 3D view"}
              >
                {is3d ? <Square /> : <Box />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{is3d ? "Flat 2D view" : "3D view"}</TooltipContent>
          </Tooltip>
        </div>
      )}

      {mode === "draw" && <DrawHud progress={progress} />}
      {hover && mode === "edit" && <SceneTooltip hover={hover} />}

      {status.state === "loading" && (
        <div className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">
          Loading the map…
        </div>
      )}
      {status.state === "failed" && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm">
          <p className="max-w-sm">{status.message}</p>
        </div>
      )}
    </div>
  );
}
