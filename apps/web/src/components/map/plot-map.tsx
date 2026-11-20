"use client";

import { ENVELOPE_CEILING_M, type LngLat } from "@envelope/engine";
import { Button } from "@envelope/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@envelope/ui/components/tooltip";
import { Box, Focus, Orbit, RotateCcwSquare, RotateCwSquare, Square } from "lucide-react";
import {
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  type StyleSpecification,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type SceneHover, SceneTooltip } from "@/components/results/scene-tooltip";
import { startEngine, useEngineStore } from "@/lib/engine/store";
import { type Clearance, clearanceFor } from "@/lib/plot/clearance";
import { usePlotStore } from "@/lib/plot/store";
import { currentSiteHold, useSiteHold } from "@/lib/plot/use-site-hold";
import { sceneFor } from "@/lib/results/scene";
import { useResultsView } from "@/lib/results/view";
import { useAsBuilt } from "@/lib/scene/as-built";
import type { ViewAngle } from "@/lib/scene/clear-view";
import { sceneTimestamp, useSceneView } from "@/lib/scene/view";
import { useStudio } from "@/lib/studio/store";
import { basemapStyle } from "./basemap-prefetch";
import { applyBasemapStyle, type BasemapPalette, setNeighboursSeeThrough } from "./basemap-style";
import { createBuildingHider } from "./building-hider";
import { createDrawController, type DrawController } from "./draw-controller";
import { DrawHud } from "./draw-hud";
import { createSceneLayers, EMPTY_SCENE, type SceneLayersView } from "./envelope-layers";
import { MapLayers } from "./map-chips";
import { createMeasureLayers, type DrawProgress, drawOutline, NO_PROGRESS } from "./measure-layers";
import { clearViewOf } from "./neighbours";
import { SceneControls } from "./scene-controls";
import { createSideLayers } from "./side-layers";
import { SiteClearanceCard } from "./site-clearance";
import { createStudyAreaLayer } from "./study-area-layer";

setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());

const PITCH_3D = 55;
/** The starting bearing; each plot then turns to its clearest view (lib/scene/clear-view.ts). */
const BEARING_3D = 120;
const PREFERRED_VIEW: ViewAngle = { pitch: PITCH_3D, bearing: BEARING_3D };
/** Orbit speed: a full turn in about 40 s. */
const ORBIT_DEG_PER_S = 9;
/** One press of the turn buttons. */
const TURN_STEP_DEG = 45;
const EMPTY_IMAGE = { width: 1, height: 1, data: new Uint8Array(4) };

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const plotVertices = () => usePlotStore.getState().draft.vertices.map((v) => v.lngLat);

/** The clearest angle onto the plot from the buildings around it (lib/scene/clear-view.ts). */
function clearAngle(map: MapLibreMap): ViewAngle {
  const { bearing, pitch } = clearViewOf(map, plotVertices(), PREFERRED_VIEW);
  return { bearing, pitch };
}

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

/** The scene to draw: none while the plot waits for its demolition to be confirmed. */
function shownScene() {
  if (currentSiteHold().held) return null;
  return sceneFor(useEngineStore.getState().state, useResultsView.getState());
}

/** How tall the shown scene is: the selected design, or the envelope (capped when unlimited). */
function sceneHeightM(): number {
  const scene = shownScene();
  if (!scene) return 0;
  const designM = scene.design?.heightM ?? 0;
  const envelopeM = scene.envelope.envelope.maxHeightM;
  const unlimited = envelopeM >= ENVELOPE_CEILING_M;
  return Math.max(designM, unlimited ? Math.max(designM * 1.2, 60) : envelopeM);
}

const NO_BREACHES: readonly number[] = [];

/** Floors of a studio variant that stick out of the envelope, for the red tint. */
function breachesOf(id: string | null): readonly number[] {
  if (!id?.startsWith("custom-")) return NO_BREACHES;
  return useStudio.getState().builds[id as `custom-${string}`]?.breaches ?? NO_BREACHES;
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
  const [covering, setCovering] = useState<Clearance | null>(null);
  const [status, setStatus] = useState<MapStatus>({ state: "loading" });
  const [is3d, setIs3d] = useState(true);
  const [orbiting, setOrbiting] = useState(false);
  const [reducedMotionOn, setReducedMotionOn] = useState(false);
  useEffect(() => setReducedMotionOn(reducedMotion()), []);
  const [hover, setHover] = useState<SceneHover | null>(null);
  const mode = usePlotStore((s) => s.mode);
  const hold = useSiteHold();
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
        style: basemapStyle() as StyleSpecification | string,
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
      const hider = createBuildingHider(map, {
        onMeasured: () => store.getState().markSiteChecked(),
        onPreview: (buildings) => {
          const clearance = clearanceFor(buildings);
          setCovering(clearance.buildings.length > 0 ? clearance : null);
        },
      });
      /** Red buildings: under the outline while drawing, or on a plot awaiting confirmation. */
      const syncClash = () => {
        if (store.getState().mode === "draw") hider.setClash("preview");
        else {
          const hold = currentSiteHold();
          hider.setClash(hold.held && hold.reason === "buildings" ? "plot" : "none");
        }
      };
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
          hider.preview(drawOutline(next));
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
      // A plot gets the clearest camera angle once (lib/scene/clear-view.ts): when it first
      // appears, is drawn or is reset, keyed by its first corner's id, which survives drags.
      // After that the user's own angle is kept.
      let angledFor: string | null = null;
      const plotNow = () => store.getState().draft.vertices.map((v) => v.lngLat);
      const newPlotAngle = (): ViewAngle | undefined => {
        const key = store.getState().draft.vertices[0]?.id ?? null;
        if (key === angledFor || map.getPitch() === 0) return undefined;
        angledFor = key;
        return clearViewOf(map, plotNow(), PREFERRED_VIEW);
      };
      let userMoved = false;
      const onUserMove = (e: { originalEvent?: unknown }) => {
        if (e.originalEvent) userMoved = true;
      };
      for (const type of ["dragstart", "zoomstart", "rotatestart", "pitchstart"] as const) {
        map.on(type, onUserMove);
        cleanups.push(() => map.off(type, onUserMove));
      }
      // Neighbours load tile by tile, so the first angle is chosen once the map has settled,
      // unless the user has already moved the camera.
      map.once("idle", () => {
        if (userMoved || store.getState().mode !== "edit" || map.getPitch() === 0) return;
        angledFor = null;
        fitToPlot(map, plotNow(), true, undefined, newPlotAngle());
      });
      setNeighboursSeeThrough(map, useSceneView.getState().layers.seeThrough);

      // Refit once the first result arrives (its height is unknown before) and when another
      // design is chosen; edits to the same design leave the camera alone.
      let framed: { design: string | null } | null = null;
      const renderScene = () => {
        const results = useResultsView.getState();
        const next = shownScene();
        const ready = next !== null;
        if (
          ready &&
          store.getState().mode === "edit" &&
          framed?.design !== results.selectedDesign
        ) {
          framed = { design: results.selectedDesign };
          fitToPlot(map, plotNow(), true, undefined, newPlotAngle());
        }
        const sceneView = useSceneView.getState();
        const view: SceneLayersView =
          next && store.getState().mode === "edit"
            ? {
                envelope: next.envelope,
                design: next.design,
                input: next.input,
                selectedFloor: results.selectedFloor,
                breaches: breachesOf(results.selectedDesign),
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
          view.breaches === shown.breaches &&
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
      angledFor = initial.draft.vertices[0]?.id ?? null;
      render();

      const unsubscribe = store.subscribe((s, prev) => {
        if (s.geometryRevision !== prev.geometryRevision) {
          const vertices = s.draft.vertices.map((v) => v.lngLat);
          draw.loadPlot(vertices);
          fitToPlot(map, vertices, true, undefined, newPlotAngle());
        }
        if (s.mode !== prev.mode) {
          measure.showDrawing(null);
          setProgress(NO_PROGRESS);
          setCovering(null);
          hider.preview(null);
          draw.setMode(s.mode);
        }
        if (
          s.mode !== prev.mode ||
          s.siteCheck !== prev.siteCheck ||
          s.demolitionConfirmed !== prev.demolitionConfirmed
        ) {
          syncClash();
          renderScene();
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
        useStudio.subscribe((st, prev) => {
          if (st.builds !== prev.builds) renderScene();
        }),
        useSceneView.subscribe(renderScene),
        useSceneView.subscribe((s, prev) => {
          if (s.layers.asBuilt !== prev.layers.asBuilt) hider.setAsBuiltVisible(s.layers.asBuilt);
          if (s.layers.seeThrough !== prev.layers.seeThrough) {
            setNeighboursSeeThrough(map, s.layers.seeThrough);
          }
        }),
        useAsBuilt.subscribe(() => {
          syncClash();
          renderScene();
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
    setOrbiting(false);
    // A flat view needs no room for height, so it frames the plot closer.
    fitToPlot(
      map,
      plotVertices(),
      true,
      sceneHeightM(),
      next ? clearAngle(map) : { pitch: 0, bearing: 0 },
    );
  }

  function resetView() {
    const map = mapRef.current;
    if (!map) return;
    setIs3d(true);
    setOrbiting(false);
    fitToPlot(map, plotVertices(), true, sceneHeightM(), clearAngle(map));
  }

  /** Turns the camera around the plot by a step; positive is clockwise, seen from above. */
  function turn(deg: number) {
    const map = mapRef.current;
    if (!map) return;
    setOrbiting(false);
    if (!is3d) {
      setIs3d(true);
      fitToPlot(map, plotVertices(), false, sceneHeightM(), clearAngle(map));
    }
    map.easeTo({
      bearing: map.getBearing() + deg,
      duration: reducedMotion() ? 0 : 500,
    });
  }

  // The orbit: a slow full turn around the plot until the user takes the camera, stops it, or
  // draws. Reduced motion gets the step buttons only.
  useEffect(() => {
    const map = mapRef.current;
    if (!orbiting || !map) return;
    if (map.getPitch() === 0) {
      setIs3d(true);
      fitToPlot(map, plotVertices(), false, sceneHeightM(), clearAngle(map));
    }
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      map.setBearing(map.getBearing() + ORBIT_DEG_PER_S * dt);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    const stop = () => setOrbiting(false);
    const canvas = map.getCanvasContainer();
    canvas.addEventListener("pointerdown", stop);
    canvas.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("keydown", stop);
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", stop);
      canvas.removeEventListener("wheel", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [orbiting]);

  useEffect(() => {
    if (mode === "draw") setOrbiting(false);
  }, [mode]);

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
          <MapLayers onReset={resetView} />
          <SceneControls />
        </div>
      )}
      {status.state === "ready" && mode === "edit" && (
        <fieldset
          aria-label="Turn the view"
          data-testid="orbit-controls"
          className="absolute right-3 bottom-9 flex items-center gap-0.5 rounded-lg border bg-background/95 p-0.5 shadow-sm backdrop-blur"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Turn the view left"
                onClick={() => turn(-TURN_STEP_DEG)}
              >
                <RotateCcwSquare />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Turn left 45°</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={orbiting ? "default" : "ghost"}
                size="icon-sm"
                aria-label={orbiting ? "Stop orbiting" : "Orbit 360° around the plot"}
                aria-pressed={orbiting}
                disabled={reducedMotionOn}
                onClick={() => setOrbiting((on) => !on)}
              >
                <Orbit />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {reducedMotionOn
                ? "Orbit is off because your system asks for reduced motion"
                : orbiting
                  ? "Stop orbiting"
                  : "Orbit 360° around the plot"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Turn the view right"
                onClick={() => turn(TURN_STEP_DEG)}
              >
                <RotateCwSquare />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Turn right 45° (or drag with the right mouse button)</TooltipContent>
          </Tooltip>
        </fieldset>
      )}

      {mode === "draw" && <DrawHud progress={progress} covering={covering} />}
      {status.state === "ready" && mode === "edit" && hold.held && hold.reason === "buildings" && (
        <SiteClearanceCard clearance={hold.clearance} />
      )}
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
