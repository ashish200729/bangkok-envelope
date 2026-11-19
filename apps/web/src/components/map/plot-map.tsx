"use client";

import { ENVELOPE_CEILING_M, type LngLat } from "@envelope/engine";
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
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type SceneHover, SceneTooltip } from "@/components/results/scene-tooltip";
import { startEngine, useEngineStore } from "@/lib/engine/store";
import { usePlotStore } from "@/lib/plot/store";
import { sceneFor } from "@/lib/results/scene";
import { useResultsView } from "@/lib/results/view";
import { useAsBuilt } from "@/lib/scene/as-built";
import { sceneTimestamp, useSceneView } from "@/lib/scene/view";
import { applyBasemapStyle, type BasemapPalette } from "./basemap-style";
import { createBuildingHider } from "./building-hider";
import { createDrawController, type DrawController } from "./draw-controller";
import { DrawHud } from "./draw-hud";
import { createSceneLayers, EMPTY_SCENE, type SceneLayersView } from "./envelope-layers";
import { MapChips, MapLegend } from "./map-chips";
import { createMeasureLayers, type DrawProgress, NO_PROGRESS } from "./measure-layers";
import { SceneControls } from "./scene-controls";
import { createSideLayers } from "./side-layers";
import { createStudyAreaLayer } from "./study-area-layer";

setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const PITCH_3D = 55;
// Looks at the sample plot from across Soi 19; from the south a 177 m neighbour hides the envelope.
const BEARING_3D = 120;
const EMPTY_IMAGE = { width: 1, height: 1, data: new Uint8Array(4) };

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

type MapStatus =
  | { state: "loading" }
  | { state: "slow" }
  | { state: "ready" }
  | { state: "failed"; message: string };

/** After this long without a map style, say so: the tile service is external. */
const SLOW_MAP_MS = 12_000;

/** How tall the shown scene is: the selected design, or the envelope (capped when unlimited). */
function sceneHeightM(): number {
  const scene = sceneFor(useEngineStore.getState().state, useResultsView.getState());
  if (!scene) return 0;
  const designM = scene.design?.heightM ?? 0;
  const envelopeM = scene.envelope.envelope.maxHeightM;
  const unlimited = envelopeM >= ENVELOPE_CEILING_M;
  return Math.max(designM, unlimited ? Math.max(designM * 1.2, 60) : envelopeM);
}

const FIT_PADDING = { top: 120, bottom: 120, left: 120, right: 120 };
const FLAT_PADDING = { top: 80, bottom: 80, left: 80, right: 80 };
const EARTH_CIRCUMFERENCE_M = 40_075_016.7;

/**
 * Fits the plot and everything standing on it. At a pitch a point h metres up is drawn about
 * h × sin(pitch) metres' worth of pixels above its foot, so after fitting the plot the camera is
 * measured on screen, then zoomed out and moved until the top of the envelope or building also
 * fits inside the padding.
 */
function fitToPlot(
  map: MapLibreMap,
  vertices: readonly LngLat[],
  animate: boolean,
  heightM = sceneHeightM(),
  angle: { pitch: number; bearing: number } = { pitch: map.getPitch(), bearing: map.getBearing() },
) {
  const first = vertices[0];
  if (!first) return;
  const bounds = new LngLatBounds();
  for (const [lng, lat] of vertices) bounds.extend([lng, lat]);
  const { pitch, bearing } = angle;
  // Seen from above the plot is all there is, so it may come closer.
  const padding = pitch > 0 ? FIT_PADDING : FLAT_PADDING;
  const camera = map.cameraForBounds(bounds, { padding, maxZoom: 18, pitch, bearing });
  if (!camera?.center || camera.zoom === undefined) return;
  const start = {
    center: map.getCenter(),
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
  };
  map.jumpTo({ center: camera.center, zoom: camera.zoom, pitch, bearing });

  if (heightM > 0 && pitch > 0) {
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    const lift = Math.sin((pitch * Math.PI) / 180) * heightM;
    const cosLat = Math.cos((first[1] * Math.PI) / 180);
    const wantMid = (FIT_PADDING.top + height - FIT_PADDING.bottom) / 2;
    const room = Math.max(50, height - FIT_PADDING.top - FIT_PADDING.bottom);
    for (let pass = 0; pass < 3; pass++) {
      const ys = vertices.map(([lng, lat]) => map.project([lng, lat]).y);
      const pxPerM = (512 * 2 ** map.getZoom()) / (EARTH_CIRCUMFERENCE_M * cosLat);
      const top = Math.min(...ys) - lift * pxPerM;
      const bottom = Math.max(...ys);
      const factor = Math.min(1, room / Math.max(1, bottom - top));
      const centre = map.unproject([width / 2, (top + bottom) / 2 + (height / 2 - wantMid)]);
      map.jumpTo({ center: centre, zoom: map.getZoom() + Math.log2(factor) });
    }
  }

  const target = { center: map.getCenter(), zoom: Math.min(18, map.getZoom()), pitch, bearing };
  map.jumpTo(start);
  if (animate && !reducedMotion()) map.easeTo({ ...target, duration: 700 });
  else map.jumpTo(target);
}

export default function PlotMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<DrawController | null>(null);
  const paletteRef = useRef<BasemapPalette>("light");
  const renderSceneRef = useRef<(() => void) | null>(null);
  const [progress, setProgress] = useState<DrawProgress>(NO_PROGRESS);
  const [status, setStatus] = useState<MapStatus>({ state: "loading" });
  const [is3d, setIs3d] = useState(true);
  const [hover, setHover] = useState<SceneHover | null>(null);
  const mode = usePlotStore((s) => s.mode);
  const night = useSceneView((s) => s.night);
  const { resolvedTheme } = useTheme();
  const palette: BasemapPalette = night || resolvedTheme === "dark" ? "dark" : "light";

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
        bearing: BEARING_3D,
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
    const slowTimer = setTimeout(
      () => setStatus((s) => (s.state === "loading" ? { state: "slow" } : s)),
      SLOW_MAP_MS,
    );
    cleanups.push(() => clearTimeout(slowTimer));

    // style.load, not load: the plot tools need only the style, and "load" also waits for every
    // tile and font, so one stalled download from the tile service would block the whole tool.
    map.once("style.load", () => {
      clearTimeout(slowTimer);
      applyBasemapStyle(map, paletteRef.current);
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
          toast.success("Plot drawn. Check which sides face a road in the sides list.");
        },
        onRejected: (message) => toast.error(message),
      });
      sides.raiseLabels();
      measure.raise();

      const scene = createSceneLayers(map, {
        onHover: setHover,
        onSelectFloor: (level) => useResultsView.getState().setSelectedFloor(level),
      });
      let shown: SceneLayersView = EMPTY_SCENE;
      // Refit once the first result arrives (its height is unknown before) and when another
      // design is chosen; edits to the same design leave the camera alone.
      let framed: { design: string | null } | null = null;
      const renderScene = () => {
        const results = useResultsView.getState();
        const ready = sceneFor(useEngineStore.getState().state, results) !== null;
        if (
          ready &&
          store.getState().mode === "edit" &&
          framed?.design !== results.selectedDesign
        ) {
          framed = { design: results.selectedDesign };
          fitToPlot(
            map,
            store.getState().draft.vertices.map((v) => v.lngLat),
            true,
          );
        }
        const sceneView = useSceneView.getState();
        const next = sceneFor(useEngineStore.getState().state, results);
        const view: SceneLayersView =
          next && store.getState().mode === "edit"
            ? {
                envelope: next.envelope,
                design: next.design,
                input: next.input,
                selectedFloor: results.selectedFloor,
                toggles: sceneView.layers,
                palette: paletteRef.current,
                timestampMs: sceneTimestamp(sceneView),
                night: sceneView.night,
              }
            : {
                ...EMPTY_SCENE,
                toggles: sceneView.layers,
                palette: paletteRef.current,
                timestampMs: sceneTimestamp(sceneView),
                night: sceneView.night,
              };
        if (
          view.envelope?.envelope === shown.envelope?.envelope &&
          view.envelope?.kind === shown.envelope?.kind &&
          view.design === shown.design &&
          view.input === shown.input &&
          view.toggles === shown.toggles &&
          view.palette === shown.palette &&
          view.selectedFloor === shown.selectedFloor &&
          view.timestampMs === shown.timestampMs &&
          view.night === shown.night
        ) {
          return;
        }
        shown = view;
        scene.update(view);
      };
      startEngine();
      renderScene();
      renderSceneRef.current = renderScene;

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
        useSceneView.subscribe(renderScene),
        useSceneView.subscribe((s, prev) => {
          if (s.layers.asBuilt !== prev.layers.asBuilt) hider.setAsBuiltVisible(s.layers.asBuilt);
        }),
        () => scene.destroy(),
        () => map.off("rotate", render),
        () => measure.destroy(),
        () => draw.destroy(),
        () => hider.destroy(),
      );
      setStatus({ state: "ready" });

      if (process.env.NODE_ENV !== "production") {
        Object.assign(window, {
          __envelopeMap: map,
          __envelopeDraw: draw,
          __sceneView: useSceneView,
          __resultsView: useResultsView,
          __asBuilt: useAsBuilt,
        });
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
    paletteRef.current = palette;
    const map = mapRef.current;
    if (map && status.state === "ready") {
      applyBasemapStyle(map, palette);
      renderSceneRef.current?.();
    }
  }, [palette, status.state]);

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
    // A flat view needs no room for height, so it frames the plot closer.
    fitToPlot(
      map,
      usePlotStore.getState().draft.vertices.map((v) => v.lngLat),
      true,
      sceneHeightM(),
      { pitch: next ? PITCH_3D : 0, bearing: next ? BEARING_3D : 0 },
    );
  }

  function resetView() {
    const map = mapRef.current;
    if (!map) return;
    setIs3d(true);
    map.jumpTo({ pitch: PITCH_3D, bearing: BEARING_3D });
    fitToPlot(
      map,
      usePlotStore.getState().draft.vertices.map((v) => v.lngLat),
      true,
    );
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
      <div
        ref={container}
        // The map's canvas carries an inline `outline: none`, so the focus ring needs !important.
        className="h-full w-full [&_canvas:focus-visible]:outline-2! [&_canvas:focus-visible]:outline-solid! [&_canvas:focus-visible]:outline-ring! [&_canvas:focus-visible]:-outline-offset-2!"
        data-testid="plot-map"
      />

      {status.state === "ready" && (
        <div className="absolute top-3 left-3 flex max-w-[calc(100%-4.5rem)] flex-wrap items-center gap-2">
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
          {/* On phones the chips get their own row and scroll sideways instead of wrapping. */}
          <div className="flex gap-2 max-sm:order-last max-sm:w-full max-sm:overflow-x-auto max-sm:[scrollbar-width:none]">
            <MapChips onReset={resetView} />
          </div>
          <SceneControls />
        </div>
      )}
      {status.state === "ready" && mode === "edit" && <MapLegend />}

      {mode === "draw" && <DrawHud progress={progress} />}
      {hover && mode === "edit" && <SceneTooltip hover={hover} />}

      {(status.state === "loading" || status.state === "slow") && (
        <div
          role="status"
          className="absolute inset-0 grid place-items-center p-6 text-center text-muted-foreground text-sm"
        >
          <p className="max-w-sm">
            {status.state === "loading"
              ? "Loading the map…"
              : "The map service is slow to respond. The plot tools appear as soon as it answers."}
          </p>
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
