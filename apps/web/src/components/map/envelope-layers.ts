import type { Layer } from "@deck.gl/core";
import { PathLayer, SolidPolygonLayer } from "@deck.gl/layers";
import { MapLibreOverlay } from "@deck.gl/maplibre";
import type { Design, Envelope, EnvelopeSlice, Floor, Polygon } from "@envelope/engine";
import type { Map as MapLibreMap } from "maplibre-gl";
import { outlinePolygons, USE_RGB } from "@/lib/results/designs";
import type { EnvelopeKind } from "@/lib/results/view";

/** Gap between stacked floor slabs, so each floor reads on its own. */
const FLOOR_GAP_M = 0.4;
const ENVELOPE_RGB = [44, 111, 181] as const;
const ENVELOPE_EDGE_RGB = [24, 74, 138] as const;

export type ScenePick =
  | { kind: "envelope"; envelopeKind: EnvelopeKind; z0M: number; z1M: number; areaM2: number }
  | { kind: "floor"; floor: Floor };

type Slab = {
  /** Rings of [lng, lat, base height]: deck.gl extrudes from each vertex's z by getElevation. */
  polygon: [number, number, number][][];
  elevation: number;
  pick: ScenePick;
  rgb: readonly [number, number, number];
};

export type SceneLayersView = {
  envelope: { kind: EnvelopeKind; envelope: Envelope } | null;
  design: Design | null;
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
          rgb: ENVELOPE_RGB,
        }),
      ),
    );
  envelopeSlabs.set(envelope, slabs);
  return slabs;
}

type Xyz = [number, number, number];
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

const designSlabs = new WeakMap<Design, Slab[]>();
function slabsForDesign(design: Design): Slab[] {
  const cached = designSlabs.get(design);
  if (cached) return cached;
  const slabs = [...design.floors]
    .sort((a, b) => b.z0M - a.z0M)
    .flatMap((floor) =>
      outlinePolygons(floor.outline).map(
        (polygon): Slab => ({
          polygon: lift(polygon, floor.z0M + FLOOR_GAP_M / 2),
          elevation: Math.max(0.1, floor.heightM - FLOOR_GAP_M),
          pick: { kind: "floor", floor },
          rgb: USE_RGB[floor.use],
        }),
      ),
    );
  designSlabs.set(design, slabs);
  return slabs;
}

const MATERIAL: {
  ambient: number;
  diffuse: number;
  shininess: number;
  specularColor: [number, number, number];
} = { ambient: 0.55, diffuse: 0.55, shininess: 16, specularColor: [40, 40, 40] };

/** Flatter light, so the 1 m terraces of a sloping height plane read as one face. */
const ENVELOPE_MATERIAL: typeof MATERIAL = {
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
    getFillColor: [...ENVELOPE_RGB, ghost ? 40 : 84],
    material: ENVELOPE_MATERIAL,
    pickable: !ghost,
    autoHighlight: !ghost,
    highlightColor: [...ENVELOPE_RGB, 110],
  });
}

function envelopeEdgesLayer(edges: Edge[], ghost: boolean) {
  return new PathLayer<Edge>({
    ...UNDER_PLOT_OUTLINE,
    id: "envelope-edges",
    data: edges,
    getPath: (d) => d.path,
    getColor: [...ENVELOPE_EDGE_RGB, ghost ? 90 : 210],
    getWidth: 1.25,
    widthUnits: "pixels",
  });
}

function floorsLayer(slabs: Slab[]) {
  return new SolidPolygonLayer<Slab>({
    ...UNDER_PLOT_OUTLINE,
    id: "design-floors",
    data: slabs,
    extruded: true,
    wireframe: true,
    getPolygon: (d) => d.polygon,
    getElevation: (d) => d.elevation,
    getFillColor: (d) => [...d.rgb, 235],
    getLineColor: [255, 255, 255, 120],
    material: MATERIAL,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 90],
  });
}

export type SceneLayers = {
  update: (view: SceneLayersView) => void;
  destroy: () => void;
};

type Handlers = { onHover: (pick: { pick: ScenePick; x: number; y: number } | null) => void };

/** One deck.gl overlay, interleaved with the map's own 3D buildings, for the envelope and designs. */
export function createSceneLayers(map: MapLibreMap, handlers: Handlers): SceneLayers {
  const overlay = new MapLibreOverlay({
    interleaved: true,
    layers: [],
    onHover: (info) => {
      const pick = (info.object as Slab | undefined)?.pick;
      handlers.onHover(pick ? { pick, x: info.x, y: info.y } : null);
    },
  });
  map.addControl(overlay);
  let current: SceneLayersView = { envelope: null, design: null };
  let layers: Layer[] = [];

  function update(view: SceneLayersView) {
    current = view;
    const ghost = view.design !== null;
    const next: Layer[] = [];
    // Floors first: the ghost envelope drawn after them is depth-tested against them, so it veils
    // the floors behind its faces without hiding them. (Turning off depth writes instead leaks GL
    // state across MapLibre's interleaved passes and blanks the floors.)
    if (view.design) next.push(floorsLayer(slabsForDesign(view.design)));
    if (view.envelope) {
      const { envelope, kind } = view.envelope;
      const slabs = slabsForEnvelope(envelope, kind);
      next.push(envelopeDepthLayer(slabs), envelopeLayer(slabs, ghost));
      next.push(envelopeEdgesLayer(edgesForEnvelope(envelope), ghost));
    }
    layers = next;
    overlay.setProps({ layers });
    if (layers.length === 0) handlers.onHover(null);
  }

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
        }),
        overlay,
        pick: (x: number, y: number) =>
          (overlay.pickObject({ x, y, radius: 2 })?.object as Slab | undefined)?.pick ?? null,
      },
    });
  }

  return { update, destroy: () => overlay.finalize() };
}
