import {
  AmbientLight,
  DirectionalLight,
  type Layer,
  LightingEffect,
  type Material,
} from "@deck.gl/core";
import { PathLayer, SolidPolygonLayer } from "@deck.gl/layers";
import { MapLibreOverlay } from "@deck.gl/maplibre";
import { SimpleMeshLayer } from "@deck.gl/mesh-layers";
import {
  type EngineInput,
  type Envelope,
  type EnvelopeSlice,
  type Floor,
  type LngLat,
  makeProjection,
  type Polygon,
} from "@envelope/engine";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { outlinePolygons } from "@/lib/results/designs";
import type { AnyDesign as Design, EnvelopeKind } from "@/lib/results/view";
import { siteAnnotations } from "@/lib/scene/annotations";
import { ccw, offsetRing, openRing } from "@/lib/scene/geometry";
import { siteLandscape, type Tree } from "@/lib/scene/landscape";
import {
  designMassing,
  type FlatPolygon,
  type MassBand,
  type MassBox,
  type MassEdge,
  type MassPane,
  type Xyz,
} from "@/lib/scene/massing";
import { type Rgb, rgb, SCENE_COLORS, shade } from "@/lib/scene/materials";
import { groundShadow } from "@/lib/scene/shadow";
import { type SceneLighting, type SunPosition, sceneLighting, sunPosition } from "@/lib/scene/sun";
import type { SceneToggles } from "@/lib/scene/view";
import { BOX_MESH, CANOPY_MESH } from "./meshes";

const ENVELOPE_RGB = rgb("#4a86cf");
const ENVELOPE_EDGE_RGB = rgb("#1f5aa6");

export type ScenePick =
  | { kind: "envelope"; envelopeKind: EnvelopeKind; z0M: number; z1M: number; areaM2: number }
  | { kind: "floor"; floor: Floor };

type Slab = {
  /** Rings of [lng, lat, base height]: deck.gl extrudes from each vertex's z by getElevation. */
  polygon: [number, number, number][][];
  elevation: number;
  pick: ScenePick;
};

export type SceneLayersView = {
  envelope: { kind: EnvelopeKind; envelope: Envelope } | null;
  design: Design | null;
  /** The engine input the result came from: the plot, its roads and sides. */
  input: EngineInput | null;
  selectedFloor: number | null;
  toggles: SceneToggles;
  /** The basemap's palette (dark theme or night): ground tones follow it. */
  palette: "light" | "dark";
  /** Bangkok date and hour as an instant, for the sun. */
  timestampMs: number;
  night: boolean;
  /** Levels of the design that stick out of the envelope (an edited design with fitting off). */
  breaches: readonly number[];
};

export const EMPTY_SCENE: SceneLayersView = {
  envelope: null,
  design: null,
  input: null,
  selectedFloor: null,
  breaches: [],
  toggles: { setback: true, heightLimit: true, asBuilt: false, seeThrough: false },
  palette: "light",
  timestampMs: 0,
  night: false,
};

function lift(polygon: Polygon, z: number): [number, number, number][][] {
  return polygon.map((ring) => ring.map(([lng, lat]): [number, number, number] => [lng, lat, z]));
}

const envelopeSlabs = new WeakMap<Envelope, Slab[]>();
function slabsForEnvelope(envelope: Envelope, kind: EnvelopeKind): Slab[] {
  const cached = envelopeSlabs.get(envelope);
  if (cached) return cached;
  // Highest first: with depth writes on, upper slices hide the hidden tops of the ones below them.
  const slabs = [...envelope.slices]
    .sort((a, b) => b.z0M - a.z0M)
    .flatMap((slice) =>
      slice.footprint.map(
        (polygon): Slab => ({
          polygon: lift(polygon, slice.z0M),
          elevation: slice.z1M - slice.z0M,
          pick: {
            kind: "envelope",
            envelopeKind: kind,
            z0M: slice.z0M,
            z1M: slice.z1M,
            areaM2: slice.areaM2,
          },
        }),
      ),
    );
  envelopeSlabs.set(envelope, slabs);
  return slabs;
}

type Edge = { path: Xyz[] };

/** Contour rings drawn at least this often on gently sloping faces (the road height plane). */
const CONTOUR_EVERY_M = 5;
/** A ring is drawn where the footprint shrinks by more than this share: a visible step. */
const STEP_SHARE = 0.1;
/** Corners turning less than this are arc segments, not edges worth a vertical line. */
const CORNER_MIN_TURN_RAD = (20 * Math.PI) / 180;

function isCorner(ring: readonly (readonly number[])[], i: number): boolean {
  const n = ring.length - 1;
  const prev = ring[(i - 1 + n) % n];
  const here = ring[i];
  const next = ring[(i + 1) % n];
  if (!prev || !here || !next) return false;
  const a = Math.atan2((here[1] ?? 0) - (prev[1] ?? 0), (here[0] ?? 0) - (prev[0] ?? 0));
  const b = Math.atan2((next[1] ?? 0) - (here[1] ?? 0), (next[0] ?? 0) - (here[0] ?? 0));
  const turn = Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
  return turn > CORNER_MIN_TURN_RAD;
}

const envelopeEdges = new WeakMap<Envelope, Edge[]>();
/** Crisp outlines: the ground, every step, contours on slopes, the top, and vertical corners. */
function edgesForEnvelope(envelope: Envelope): Edge[] {
  const cached = envelopeEdges.get(envelope);
  if (cached) return cached;
  const edges: Edge[] = [];
  const rings = (slice: EnvelopeSlice, z: number) => {
    for (const polygon of slice.footprint) {
      for (const ring of polygon) edges.push({ path: ring.map(([lng, lat]) => [lng, lat, z]) });
    }
  };
  const { slices } = envelope;
  slices.forEach((slice, i) => {
    const next = slices[i + 1];
    if (i === 0) rings(slice, slice.z0M);
    const step = !next || (slice.areaM2 - next.areaM2) / slice.areaM2 > STEP_SHARE;
    if (step || slice.z1M % CONTOUR_EVERY_M === 0) rings(slice, slice.z1M);
    if (next && step) rings(next, next.z0M);
    for (const polygon of slice.footprint) {
      const outer = polygon[0] ?? [];
      for (let v = 0; v < outer.length - 1; v++) {
        const p = outer[v];
        if (!p || !isCorner(outer, v)) continue;
        edges.push({
          path: [
            [p[0], p[1], slice.z0M],
            [p[0], p[1], slice.z1M],
          ],
        });
      }
    }
  });
  envelopeEdges.set(envelope, edges);
  return edges;
}

/** Outline rings just outside a floor, at its floor and ceiling, plus its corners. */
function floorOutline(floor: Floor): Edge[] {
  const first = floor.outline[0]?.[0];
  if (!first) return [];
  const projection = makeProjection(first);
  const top = floor.z0M + floor.heightM;
  const edges: Edge[] = [];
  for (const polygon of outlinePolygons(floor.outline)) {
    const ring = ccw(openRing(polygon[0] ?? []).map(projection.toLocal));
    if (ring.length < 3) continue;
    const out = offsetRing(ring, 0.35).map((p) => projection.toLngLat(p));
    const closed = [...out, out[0] as LngLat];
    edges.push({ path: closed.map(([lng, lat]) => [lng, lat, floor.z0M + 0.05]) });
    edges.push({ path: closed.map(([lng, lat]) => [lng, lat, top]) });
    for (const [lng, lat] of out) {
      edges.push({
        path: [
          [lng, lat, floor.z0M + 0.05],
          [lng, lat, top],
        ],
      });
    }
  }
  return edges;
}

/** Façade render and slab concrete: soft, mostly diffuse. */
/** Matte massing: mostly ambient, so shaded faces stay light, like a white card model. */
const WALL_MATERIAL: Material = {
  ambient: 0.74,
  diffuse: 0.38,
  shininess: 8,
  specularColor: [16, 16, 16],
};
const GROUND_MATERIAL: Material = {
  ambient: 0.8,
  diffuse: 0.3,
  shininess: 4,
  specularColor: [0, 0, 0],
};
/** Flatter light, so the 1 m terraces of a sloping height plane read as one face. */
const ENVELOPE_MATERIAL: Material = {
  ambient: 0.85,
  diffuse: 0.3,
  shininess: 8,
  specularColor: [0, 0, 0],
};

/**
 * Below the plot outline, corner handles and labels (drawn flat on top, so editing stays easy),
 * above the basemap, sharing its depth buffer with the 3D buildings. `beforeId` is read by
 * @deck.gl/maplibre but missing from the layer prop types.
 */
const UNDER_PLOT_OUTLINE = { beforeId: "plot-sides-road" } as object;

/**
 * Depth-only pass: the same slabs, fully transparent, drawn first. The tinted pass then passes the
 * depth test (less-equal) only on the front-most faces, so overlapping 1 m bands are tinted once
 * instead of striping where translucent faces stack.
 */
function envelopeDepthLayer(slabs: Slab[]) {
  return new SolidPolygonLayer<Slab>({
    ...UNDER_PLOT_OUTLINE,
    id: "envelope-depth",
    data: slabs,
    extruded: true,
    getPolygon: (d) => d.polygon,
    getElevation: (d) => d.elevation,
    getFillColor: [0, 0, 0, 0],
    material: false,
  });
}

function envelopeLayer(slabs: Slab[], ghost: boolean) {
  return new SolidPolygonLayer<Slab>({
    ...UNDER_PLOT_OUTLINE,
    id: "envelope",
    data: slabs,
    extruded: true,
    getPolygon: (d) => d.polygon,
    getElevation: (d) => d.elevation,
    getFillColor: [...ENVELOPE_RGB, ghost ? 14 : 70],
    material: ENVELOPE_MATERIAL,
    pickable: !ghost,
    autoHighlight: !ghost,
    highlightColor: [...ENVELOPE_RGB, 105],
  });
}

function envelopeEdgesLayer(edges: Edge[], ghost: boolean) {
  return new PathLayer<Edge>({
    ...UNDER_PLOT_OUTLINE,
    id: "envelope-edges",
    data: edges,
    getPath: (d) => d.path,
    getColor: [...ENVELOPE_EDGE_RGB, ghost ? 85 : 220],
    getWidth: ghost ? 1 : 1.25,
    widthUnits: "pixels",
  });
}

const fill = (color: Rgb): [number, number, number, number] => [...color, 255];

/** Floors outside the envelope: the checklist's fail red, as hex like every map colour. */
const BREACH_RGB = rgb("#d6453d");

function bandLayer(
  id: string,
  data: MassBand[],
  pickable: boolean,
  breaches: readonly number[] = [],
) {
  const outside = new Set(breaches);
  return new SolidPolygonLayer<MassBand>({
    ...UNDER_PLOT_OUTLINE,
    id,
    data,
    extruded: true,
    getPolygon: (d) => d.polygon,
    getElevation: (d) => d.elevation,
    getFillColor: (d) => fill(outside.has(d.floor.level) ? BREACH_RGB : d.color),
    updateTriggers: { getFillColor: breaches.join(",") },
    material: WALL_MATERIAL,
    pickable,
    autoHighlight: pickable,
    highlightColor: [255, 255, 255, 70],
  });
}

/** Ground tones drop towards the dark basemap, so the plot does not glow at night. */
const DARK_GROUND_SHADE = -0.72;

function flatLayer(id: string, data: FlatPolygon[], material: Material, dark = false) {
  return new SolidPolygonLayer<FlatPolygon>({
    ...UNDER_PLOT_OUTLINE,
    id,
    data,
    getPolygon: (d) => d.polygon,
    getFillColor: (d) => fill(dark ? shade(d.color, DARK_GROUND_SHADE) : d.color),
    updateTriggers: { getFillColor: dark },
    material,
  });
}

function boxLayer(id: string, data: MassBox[]) {
  return new SimpleMeshLayer<MassBox>({
    ...UNDER_PLOT_OUTLINE,
    id,
    data,
    mesh: BOX_MESH,
    getPosition: (d) => d.position,
    getOrientation: (d) => [0, d.yawDeg, 0],
    getScale: (d) => d.scale,
    getColor: (d) => fill(d.color),
    material: WALL_MATERIAL,
  });
}

/**
 * SimpleMeshLayer always applies the lights, so a lit window "glows" through an ambient factor that
 * cancels the dim night ambient (0.55 × the night sky colour): lit panes show near their own
 * colour against the dark façade.
 */
const NIGHT_WINDOW_MATERIAL: Material = {
  ambient: 4.2,
  diffuse: 0,
  shininess: 1,
  specularColor: [0, 0, 0],
};

/** Windows are drawn at night only: by day the massing stays clean (floor lines, no grid). */
function windowsLayer(data: MassPane[]) {
  return new SimpleMeshLayer<MassPane>({
    ...UNDER_PLOT_OUTLINE,
    id: "design-windows",
    data,
    mesh: BOX_MESH,
    getPosition: (d) => d.position,
    getOrientation: (d) => [0, d.yawDeg, 0],
    getScale: (d) => d.scale,
    getColor: (d) => fill(d.lit ? SCENE_COLORS.litWindow : SCENE_COLORS.darkWindow),
    material: NIGHT_WINDOW_MATERIAL,
  });
}

function designEdgesLayer(edges: MassEdge[]) {
  return new PathLayer<MassEdge>({
    ...UNDER_PLOT_OUTLINE,
    id: "design-edges",
    data: edges,
    getPath: (d) => d.path,
    getColor: [...SCENE_COLORS.edge, 150],
    getWidth: 1,
    widthUnits: "pixels",
  });
}

function setbackLayer(bands: FlatPolygon[]) {
  return new SolidPolygonLayer<FlatPolygon>({
    ...UNDER_PLOT_OUTLINE,
    id: "site-setback",
    data: bands,
    getPolygon: (d) => d.polygon,
    getFillColor: (d) => [...d.color, 92],
    material: false,
  });
}

const SHADOW_RGBA: [number, number, number, number] = [28, 36, 52, 52];

function shadowLayer(ring: Xyz[]) {
  return new SolidPolygonLayer<Xyz[]>({
    ...UNDER_PLOT_OUTLINE,
    id: "site-shadow",
    data: [ring],
    getPolygon: (d) => d,
    getFillColor: SHADOW_RGBA,
    material: false,
  });
}

function treeLayers(trees: Tree[]) {
  return [
    new SimpleMeshLayer<Tree>({
      ...UNDER_PLOT_OUTLINE,
      id: "site-tree-trunks",
      data: trees,
      mesh: BOX_MESH,
      getPosition: (d) => d.position,
      getScale: (d) => [0.4, 0.4, d.heightM * 0.5],
      getColor: fill(SCENE_COLORS.trunk),
      material: WALL_MATERIAL,
    }),
    new SimpleMeshLayer<Tree>({
      ...UNDER_PLOT_OUTLINE,
      id: "site-trees",
      data: trees,
      mesh: CANOPY_MESH,
      getPosition: (d) => [d.position[0], d.position[1], d.heightM - d.radiusM * 0.85],
      getScale: (d) => [d.radiusM, d.radiusM, d.radiusM],
      getColor: (d) => fill(d.color),
      material: GROUND_MATERIAL,
    }),
  ];
}

function highlightLayers(id: string, edges: Edge[], color: Rgb, strong: boolean) {
  return [
    new PathLayer<Edge>({
      ...UNDER_PLOT_OUTLINE,
      id: `${id}-glow`,
      data: edges,
      getPath: (d) => d.path,
      getColor: [...color, strong ? 90 : 60],
      getWidth: strong ? 9 : 7,
      widthUnits: "pixels",
      capRounded: true,
      jointRounded: true,
    }),
    new PathLayer<Edge>({
      ...UNDER_PLOT_OUTLINE,
      id,
      data: edges,
      getPath: (d) => d.path,
      getColor: [...color, 255],
      getWidth: strong ? 2.5 : 1.75,
      widthUnits: "pixels",
    }),
  ];
}

export type SceneLayers = {
  update: (view: SceneLayersView) => void;
  destroy: () => void;
};

type Handlers = {
  onHover: (pick: { pick: ScenePick; x: number; y: number } | null) => void;
  /** A floor was clicked (its level), or empty map (null) while a design is shown. */
  onSelectFloor: (level: number | null) => void;
};

/** Shadows in the interleaved overlay: see decision 52 before switching them on. */
const SHADOWS = false;

/** One deck.gl overlay, interleaved with the map's own 3D buildings, for the envelope and designs. */
export function createSceneLayers(map: MapLibreMap, handlers: Handlers): SceneLayers {
  const ambient = new AmbientLight({ color: [255, 255, 255], intensity: 0.8 });
  const sun = new DirectionalLight({
    color: [255, 250, 240],
    intensity: 1.5,
    direction: [-0.5, 0.5, -1],
    _shadow: SHADOWS,
  });
  const lighting = new LightingEffect({ ambient, sun });
  lighting.shadowColor = [0.12, 0.14, 0.2, 0.32];
  let hoveredFloor: number | null = null;

  const overlay = new MapLibreOverlay({
    interleaved: true,
    layers: [],
    effects: [lighting],
    onHover: (info) => {
      const pick = (info.object as { pick?: ScenePick; floor?: Floor } | undefined) ?? undefined;
      const scenePick: ScenePick | null = pick?.pick
        ? pick.pick
        : pick?.floor
          ? { kind: "floor", floor: pick.floor }
          : null;
      const level = scenePick?.kind === "floor" ? scenePick.floor.level : null;
      if (level !== hoveredFloor) {
        hoveredFloor = level;
        render();
      }
      handlers.onHover(scenePick ? { pick: scenePick, x: info.x, y: info.y } : null);
    },
  });
  map.addControl(overlay);
  let current: SceneLayersView = EMPTY_SCENE;
  let layers: Layer[] = [];
  let lit: SceneLighting | null = null;
  let sunAt: SunPosition | null = null;
  let litKey = "";
  let shadow: { design: Design; key: string; ring: Xyz[] | null } | null = null;
  let annotations: {
    input: EngineInput;
    buildable: unknown;
    value: ReturnType<typeof siteAnnotations>;
  } | null = null;
  function annotationsFor(input: EngineInput, view: SceneLayersView) {
    const buildable = view.envelope?.envelope.slices[0]?.footprint ?? null;
    if (annotations?.input !== input || annotations.buildable !== buildable) {
      annotations = { input, buildable, value: siteAnnotations(input, buildable) };
    }
    return annotations.value;
  }

  function applyLighting(view: SceneLayersView) {
    const origin = view.input?.plot.vertices[0] ?? (map.getCenter().toArray() as [number, number]);
    const key = `${view.timestampMs}|${view.night}|${origin[0].toFixed(3)},${origin[1].toFixed(3)}`;
    if (key === litKey) return;
    litKey = key;
    sunAt = sunPosition(view.timestampMs, origin[1], origin[0]);
    lit = sceneLighting(sunAt, view.night);
    ambient.color = lit.ambient.color;
    ambient.intensity = lit.ambient.intensity;
    sun.color = lit.sun.color;
    sun.intensity = lit.sun.intensity;
    sun.direction = lit.sun.direction;
    // The lights are read every frame; a new effects array makes deck.gl redraw with them.
    overlay.setProps({ effects: [lighting] });
    map.triggerRepaint();
  }

  /** The ground shadow follows the sun; only daylight casts one. */
  function shadowFor(design: Design, view: SceneLayersView): Xyz[] | null {
    if (view.night || !sunAt || !lit?.castsShadows) return null;
    if (shadow?.design === design && shadow.key === litKey) return shadow.ring;
    shadow = { design, key: litKey, ring: groundShadow(design, sunAt) };
    return shadow.ring;
  }

  function render() {
    const view = current;
    const next: Layer[] = [];
    const design = view.design;
    const site = view.input ? annotationsFor(view.input, view) : null;
    if (design) {
      const massing = designMassing(design);
      if (view.input) {
        const buildable = view.envelope?.envelope.slices[0]?.footprint ?? null;
        const plot = view.input.plot.vertices;
        const landscape = siteLandscape({ plot, design, buildable });
        next.push(
          flatLayer("site-ground", landscape.ground, GROUND_MATERIAL, view.palette === "dark"),
        );
        if (site && view.toggles.setback) next.push(setbackLayer(site.bands));
        const ring = shadowFor(design, view);
        if (ring) next.push(shadowLayer(ring));
        next.push(...treeLayers(landscape.trees));
      }
      next.push(
        bandLayer("design-floors", massing.facades, true, view.breaches),
        bandLayer("design-slabs", massing.slabs, false),
        flatLayer("design-roofs", massing.roofs, WALL_MATERIAL),
        boxLayer("design-details", massing.boxes),
        designEdgesLayer(massing.edges),
      );
      if (view.night) next.push(windowsLayer(massing.panes));
      const floorAt = (level: number | null) =>
        level === null ? undefined : design.floors.find((f) => f.level === level);
      const selected = floorAt(view.selectedFloor);
      const hovered = hoveredFloor !== view.selectedFloor ? floorAt(hoveredFloor) : undefined;
      if (hovered) {
        next.push(
          ...highlightLayers("floor-hover", floorOutline(hovered), SCENE_COLORS.hover, false),
        );
      }
      if (selected) {
        next.push(
          ...highlightLayers(
            "floor-selected",
            floorOutline(selected),
            SCENE_COLORS.highlight,
            true,
          ),
        );
      }
    } else if (site && view.toggles.setback) {
      next.push(setbackLayer(site.bands));
    }
    // The envelope last: as a ghost it is depth-tested against the building, so it veils what is
    // behind its faces without hiding it. (Turning off depth writes instead leaks GL state across
    // MapLibre's interleaved passes and blanks the floors.)
    if (view.envelope && view.toggles.heightLimit) {
      const ghost = design !== null;
      const { envelope, kind } = view.envelope;
      const slabs = slabsForEnvelope(envelope, kind);
      next.push(envelopeDepthLayer(slabs), envelopeLayer(slabs, ghost));
      next.push(envelopeEdgesLayer(edgesForEnvelope(envelope), ghost));
    }
    layers = next;
    overlay.setProps({ layers });
  }

  function update(view: SceneLayersView) {
    if (view.design !== current.design) hoveredFloor = null;
    current = view;
    applyLighting(view);
    render();
    if (layers.length === 0) handlers.onHover(null);
  }

  const onClick = (event: MapMouseEvent) => {
    if (!current.design) return;
    const info = overlay.pickObject({
      x: event.point.x,
      y: event.point.y,
      radius: 2,
      layerIds: ["design-floors"],
    });
    const floor = (info?.object as MassBand | undefined)?.floor;
    handlers.onSelectFloor(floor ? floor.level : null);
  };
  map.on("click", onClick);

  if (process.env.NODE_ENV !== "production") {
    Object.assign(window, {
      __envelopeDeck: {
        layers: () =>
          layers.map((layer) => ({
            id: layer.id,
            length: (layer.props.data as readonly unknown[]).length,
            opacity: layer.props.opacity,
          })),
        view: () => ({
          envelopeKind: current.envelope?.kind ?? null,
          maxHeightM: current.envelope?.envelope.maxHeightM ?? null,
          groundAreaM2: current.envelope?.envelope.groundAreaM2 ?? null,
          designId: current.design?.id ?? null,
          selectedFloor: current.selectedFloor,
          hoveredFloor,
          night: current.night,
          sun: {
            timestampMs: current.timestampMs,
            iso: new Date(current.timestampMs).toISOString(),
            phase: lit?.phase ?? null,
            direction: lit?.sun.direction ?? null,
            intensity: lit?.sun.intensity ?? null,
            ambient: lit?.ambient.intensity ?? null,
          },
          shadows: SHADOWS,
          toggles: current.toggles,
        }),
        overlay,
        pick: (x: number, y: number) => {
          const object = overlay.pickObject({ x, y, radius: 2 })?.object as
            | { pick?: ScenePick; floor?: Floor }
            | undefined;
          if (object?.pick) return object.pick;
          return object?.floor ? { kind: "floor", floor: object.floor } : null;
        },
      },
    });
  }

  return {
    update,
    destroy: () => {
      map.off("click", onClick);
      overlay.finalize();
    },
  };
}
