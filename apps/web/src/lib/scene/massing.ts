import { type Floor, makeProjection, type Polygon, type XY } from "@envelope/engine";
import { outlinePolygons } from "@/lib/results/designs";
import type { AnyDesign as Design } from "@/lib/results/view";
import {
  ccw,
  type Edge,
  offsetRing,
  openRing,
  pointInRing,
  ringCentroidXY,
  ringEdges,
} from "./geometry";
import { FACADES, type Rgb, SCENE_COLORS } from "./materials";
import { hash01 } from "./random";

export type Xyz = [number, number, number];

/** An extruded band: rings of [lng, lat, base z], raised by `elevation`. */
export type MassBand = { polygon: Xyz[][]; elevation: number; color: Rgb; floor: Floor };
/** A flat polygon at its vertices' z. */
export type FlatPolygon = { polygon: Xyz[][]; color: Rgb };
/**
 * One instance of the unit box mesh (x and y centred on the position, z from 0 to 1), turned by
 * `yawDeg` (counter-clockwise from east) and scaled to [along the edge, outward, up] metres.
 */
export type MassBox = { position: Xyz; yawDeg: number; scale: Xyz; color: Rgb };
export type MassPane = MassBox & { level: number; lit: boolean };
export type MassEdge = { path: Xyz[] };

export type Massing = {
  facades: MassBand[];
  /** Thin floor lines at every storey. */
  slabs: MassBand[];
  roofs: FlatPolygon[];
  /** Parapets and the rooftop plant room and core. */
  boxes: MassBox[];
  /** Window panes, kept apart so night mode can light them. */
  panes: MassPane[];
  /** Crisp corner and roof lines. */
  edges: MassEdge[];
  /** Where the height callout goes: above the centre of the top floor. */
  top: Xyz | null;
};

/** Floor line height at each storey, and how far it stands proud of the façade. */
export const SLAB_M = 0.24;
const SLAB_PROUD_M = 0.06;
const PANE_DEPTH_M = 0.05;
const PARAPET_M = 1.05;
const PARAPET_THICK_M = 0.2;
/** A floor whose roof is exposed: the floor above covers less than this share of it. */
const EXPOSED_ROOF_SHARE = 0.97;
/** Corners turning less than this are arc segments, not edges worth a line. */
const CORNER_MIN_TURN_DEG = 20;

/**
 * Centres of window bays along an edge: as many bays of about `spacing` as fit, evenly spread so
 * both ends get the same margin. An edge shorter than three quarters of a bay gets none.
 */
export function bayCentres(length: number, spacing: number): number[] {
  if (length < spacing * 0.75) return [];
  const bays = Math.max(1, Math.round(length / spacing));
  const step = length / bays;
  return Array.from({ length: bays }, (_, i) => (i + 0.5) * step);
}

const cache = new WeakMap<Design, Massing>();

/**
 * Architectural massing for a design: a pure function of its floors, so an edited design draws
 * the same way. Cached per design object (each engine result brings new objects).
 */
export function designMassing(design: Design): Massing {
  const cached = cache.get(design);
  if (cached) return cached;
  const massing = buildMassing(design.floors);
  cache.set(design, massing);
  return massing;
}

function turnDeg(prev: Edge, next: Edge): number {
  const cos = prev.dir.x * next.dir.x + prev.dir.y * next.dir.y;
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

function buildMassing(floors: readonly Floor[]): Massing {
  const out: Massing = {
    facades: [],
    slabs: [],
    roofs: [],
    boxes: [],
    panes: [],
    edges: [],
    top: null,
  };
  const firstPoint = floors[0]?.outline[0]?.[0];
  if (!firstPoint) return out;
  const projection = makeProjection(firstPoint);
  const at = (p: XY, z: number): Xyz => {
    const [lng, lat] = projection.toLngLat(p);
    return [lng, lat, z];
  };
  const box = (
    edge: Edge,
    along: number,
    out0: number,
    z: number,
    scale: Xyz,
    color: Rgb,
  ): MassBox => {
    const centre = {
      x: edge.a.x + edge.dir.x * along + edge.normal.x * (out0 + scale[1] / 2),
      y: edge.a.y + edge.dir.y * along + edge.normal.y * (out0 + scale[1] / 2),
    };
    return { position: at(centre, z), yawDeg: edge.yawDeg, scale, color };
  };

  floors.forEach((floor, index) => {
    const facade = FACADES[floor.use];
    const above = floors[index + 1];
    const roofExposed = !above || above.areaM2 < floor.areaM2 * EXPOSED_ROOF_SHARE;
    const top = floor.z0M + floor.heightM;
    const bandZ = floor.z0M + SLAB_M;
    const bandH = Math.max(0.1, floor.heightM - SLAB_M);

    outlinePolygons(floor.outline).forEach((polygon, polyIndex) => {
      const rings = (polygon as Polygon).map((ring) => openRing(ring).map(projection.toLocal));
      const outer = ccw(rings[0] ?? []);
      if (outer.length < 3) return;
      const holes = rings.slice(1);
      const lift = (ring: readonly XY[], z: number) =>
        [...ring, ring[0] as XY].map((p) => at(p, z));

      out.slabs.push({
        polygon: [
          lift(offsetRing(outer, SLAB_PROUD_M), floor.z0M),
          ...holes.map((h) => lift(h, floor.z0M)),
        ],
        elevation: SLAB_M,
        color: facade.line,
        floor,
      });
      out.facades.push({
        polygon: [lift(outer, bandZ), ...holes.map((h) => lift(h, bandZ))],
        elevation: bandH,
        color: facade.wall,
        floor,
      });

      const edges = ringEdges(outer);
      const proud = offsetRing(
        edges.map((e) => e.a),
        0.08,
      );
      edges.forEach((edge, edgeIndex) => {
        const prev = edges[(edgeIndex - 1 + edges.length) % edges.length] as Edge;
        const corner = proud[edgeIndex];
        if (corner && turnDeg(prev, edge) >= CORNER_MIN_TURN_DEG) {
          out.edges.push({ path: [at(corner, floor.z0M), at(corner, top)] });
        }
        const { windows } = facade;
        if (!windows) return;
        const width = windows.spacingM * windows.widthShare;
        const height = bandH * windows.heightShare;
        const z = bandZ + bandH * windows.sillShare;
        bayCentres(edge.length, windows.spacingM).forEach((along, i) => {
          out.panes.push({
            ...box(edge, along, 0, z, [width, PANE_DEPTH_M, height], windows.glass),
            level: floor.level,
            lit: hash01(floor.level, polyIndex, edgeIndex, i) < windows.litShare,
          });
        });
      });

      if (roofExposed) {
        out.roofs.push({
          polygon: [lift(outer, top + 0.03), ...holes.map((h) => lift(h, top + 0.03))],
          color: SCENE_COLORS.roof,
        });
        out.edges.push({ path: lift(proud, top + PARAPET_M) });
        for (const edge of edges) {
          out.boxes.push(
            box(
              edge,
              edge.length / 2,
              -PARAPET_THICK_M,
              top,
              [edge.length + PARAPET_THICK_M, PARAPET_THICK_M, PARAPET_M],
              SCENE_COLORS.parapet,
            ),
          );
        }
      }
      if (!above && polyIndex === 0) {
        const plant = rooftopPlant(outer, edges, top, at);
        out.boxes.push(...plant);
        const centre = ringCentroidXY(outer);
        const peak = Math.max(top + PARAPET_M, ...plant.map((b) => b.position[2] + b.scale[2]));
        out.top = at(centre, peak + 2);
      }
    });
  });
  return out;
}

/** A plant room and a lift core on the top roof, lined up with its longest side. */
function rooftopPlant(
  outer: readonly XY[],
  edges: Edge[],
  top: number,
  at: (p: XY, z: number) => Xyz,
): MassBox[] {
  const longest = edges.reduce<Edge | null>((a, e) => (!a || e.length > a.length ? e : a), null);
  if (!longest) return [];
  const area = Math.abs(
    outer.reduce((s, p, i) => {
      const q = outer[(i + 1) % outer.length] as XY;
      return s + p.x * q.y - q.x * p.y;
    }, 0) / 2,
  );
  const side = Math.sqrt(area);
  if (side < 8) return [];
  const centre = ringCentroidXY(outer);
  const w = Math.min(14, side * 0.36);
  const d = Math.min(9, side * 0.24);
  const corners = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sy) => ({
      x: centre.x + (longest.dir.x * (sx * w)) / 2 + (longest.normal.x * (sy * d)) / 2,
      y: centre.y + (longest.dir.y * (sx * w)) / 2 + (longest.normal.y * (sy * d)) / 2,
    })),
  );
  if (!corners.every((c) => pointInRing(c, outer))) return [];
  const core = {
    x: centre.x + longest.dir.x * (w / 2 - 1.8),
    y: centre.y + longest.dir.y * (w / 2 - 1.8),
  };
  return [
    {
      position: at(centre, top),
      yawDeg: longest.yawDeg,
      scale: [w, d, 3],
      color: SCENE_COLORS.core,
    },
    {
      position: at(core, top),
      yawDeg: longest.yawDeg,
      scale: [3.4, 3.4, 4.4],
      color: SCENE_COLORS.core,
    },
  ];
}
