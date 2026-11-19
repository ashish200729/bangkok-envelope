import { z } from "zod";
import type { Bbox } from "./site-area";

/**
 * Turns an Overpass `out geom` response into the committed snapshot format: plain GeoJSON
 * coordinates plus the few OSM tags the normalisers read. Tags stay raw so normalisation can
 * change without fetching again.
 */

type Position = [number, number];

const BUILDING_TAGS = [
  "building",
  "height",
  "min_height",
  "building:levels",
  "building:min_level",
  "name",
  "name:en",
] as const;
const ROAD_TAGS = ["highway", "name", "name:en", "width", "lanes", "oneway", "service"] as const;
const STATION_TAGS = [
  "name",
  "name:en",
  "network",
  "operator",
  "line",
  "railway",
  "station",
  "public_transport",
] as const;

/** Road classes kept in the snapshot: carriageways a plot can front, not footpaths or steps. */
export const ROAD_CLASSES = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "residential",
  "unclassified",
  "living_street",
  "service",
  "pedestrian",
  "road",
]);
/** Service roads that are private car-park lanes, not streets. */
const SKIPPED_SERVICE = new Set(["parking_aisle", "drive-through", "driveway"]);

export type OsmTags = Record<string, string>;

export type SnapshotBuilding = { id: string; tags: OsmTags; coordinates: Position[][][] };
export type SnapshotRoad = { id: string; tags: OsmTags; coordinates: Position[][] };
export type SnapshotStation = { id: string; tags: OsmTags; coordinates: Position };

export type SiteSnapshot = {
  source: string;
  attribution: string;
  license: string;
  licenseUrl: string;
  /** When the snapshot was fetched (ISO 8601). */
  fetchedAt: string;
  /** Overpass's `timestamp_osm_base`: the OSM data's own date. */
  osmBaseAt: string | null;
  bbox: Bbox;
  buildings: SnapshotBuilding[];
  roads: SnapshotRoad[];
  stations: SnapshotStation[];
};

const coord = z.object({ lat: z.number(), lon: z.number() });
const overpassElement = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number().int(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: coord.optional(),
  tags: z.record(z.string(), z.string()).optional(),
  geometry: z.array(coord.nullable()).optional(),
  members: z
    .array(
      z.object({
        type: z.string(),
        role: z.string(),
        geometry: z.array(coord.nullable()).optional(),
      }),
    )
    .optional(),
});
export const overpassResponseSchema = z.object({
  osm3s: z.object({ timestamp_osm_base: z.string().optional() }).optional(),
  elements: z.array(overpassElement),
});
export type OverpassResponse = z.infer<typeof overpassResponseSchema>;
type OverpassElement = z.infer<typeof overpassElement>;

const round7 = (n: number) => Math.round(n * 1e7) / 1e7;

function toPositions(geometry: OverpassElement["geometry"]): Position[] {
  const out: Position[] = [];
  for (const point of geometry ?? []) {
    if (!point) continue;
    const p: Position = [round7(point.lon), round7(point.lat)];
    const last = out.at(-1);
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

function pick(tags: OsmTags | undefined, keys: readonly string[]): OsmTags {
  const out: OsmTags = {};
  for (const key of keys) {
    const value = tags?.[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

const samePosition = (a: Position | undefined, b: Position | undefined) =>
  a !== undefined && b !== undefined && a[0] === b[0] && a[1] === b[1];

const isClosedRing = (ring: Position[]) => ring.length >= 4 && samePosition(ring[0], ring.at(-1));

/** Joins way segments end to end into closed rings; segments that never close are dropped. */
export function assembleRings(segments: Position[][]): Position[][] {
  const open = segments.filter((s) => s.length >= 2).map((s) => [...s]);
  const rings: Position[][] = [];
  while (open.length > 0) {
    const ring = open.shift() as Position[];
    let extended = true;
    while (!isClosedRing(ring) && extended) {
      extended = false;
      for (let i = 0; i < open.length; i++) {
        const seg = open[i] as Position[];
        const end = ring.at(-1);
        if (samePosition(seg[0], end)) ring.push(...seg.slice(1));
        else if (samePosition(seg.at(-1), end)) ring.push(...seg.slice(0, -1).reverse());
        else continue;
        open.splice(i, 1);
        extended = true;
        break;
      }
    }
    if (isClosedRing(ring)) rings.push(ring);
  }
  return rings;
}

export function pointInRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as Position;
    const [xj, yj] = ring[j] as Position;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Builds MultiPolygon coordinates from a multipolygon relation's outer and inner member ways. */
export function relationToMultiPolygon(
  members: NonNullable<OverpassElement["members"]>,
): Position[][][] {
  const ways = members.filter((m) => m.type === "way");
  const outers = assembleRings(
    ways.filter((m) => m.role !== "inner").map((m) => toPositions(m.geometry)),
  );
  const inners = assembleRings(
    ways.filter((m) => m.role === "inner").map((m) => toPositions(m.geometry)),
  );
  const polygons = outers.map((outer) => [outer]);
  for (const inner of inners) {
    const first = inner[0] as Position;
    const host = polygons.find((p) => pointInRing(first, p[0] as Position[]));
    host?.push(inner);
  }
  return polygons;
}

function centroid(points: Position[]): Position | null {
  if (points.length === 0) return null;
  const sum = points.reduce<Position>((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
  return [round7(sum[0] / points.length), round7(sum[1] / points.length)];
}

const RAIL_STATION_KINDS = new Set(["subway", "light_rail", "monorail", "train"]);

/**
 * A rail transit station (BTS, MRT, Airport Rail Link), not a bus station, a platform or a
 * mainline halt (the SRT Asok halt is not mass transit in the plan's sense).
 */
export function isRailStation(tags: OsmTags): boolean {
  if (tags.railway === "halt") return false;
  if (tags.railway === "station") return true;
  if (tags.public_transport !== "station") return false;
  if (tags.station !== undefined && RAIL_STATION_KINDS.has(tags.station)) return true;
  return ["subway", "light_rail", "monorail", "train"].some((k) => tags[k] === "yes");
}

/** Converts a parsed Overpass response into the snapshot, deduplicating stations mapped twice. */
export function snapshotFromOverpass(
  response: OverpassResponse,
  meta: {
    bbox: Bbox;
    fetchedAt: string;
    source: string;
    attribution: string;
    license: string;
    licenseUrl: string;
  },
): SiteSnapshot {
  const buildings: SnapshotBuilding[] = [];
  const roads: SnapshotRoad[] = [];
  const stations: SnapshotStation[] = [];

  for (const el of response.elements) {
    const id = `${el.type}/${el.id}`;
    const tags = el.tags ?? {};

    if (tags.building !== undefined && el.type !== "node") {
      let coordinates: Position[][][] = [];
      if (el.type === "way") {
        const ring = toPositions(el.geometry);
        if (ring.length >= 3 && !samePosition(ring[0], ring.at(-1))) ring.push(ring[0] as Position);
        if (isClosedRing(ring)) coordinates = [[ring]];
      } else if (tags.type === "multipolygon" && el.members) {
        coordinates = relationToMultiPolygon(el.members);
      }
      if (coordinates.length > 0) {
        buildings.push({ id, tags: pick(tags, BUILDING_TAGS), coordinates });
        continue;
      }
    }

    if (el.type === "way" && tags.highway !== undefined && ROAD_CLASSES.has(tags.highway)) {
      if (tags.highway === "service" && tags.service && SKIPPED_SERVICE.has(tags.service)) continue;
      const line = toPositions(el.geometry);
      if (line.length >= 2) roads.push({ id, tags: pick(tags, ROAD_TAGS), coordinates: [line] });
      continue;
    }

    if (isRailStation(tags) && tags.name !== undefined) {
      const point: Position | null =
        el.type === "node" && el.lat !== undefined && el.lon !== undefined
          ? [round7(el.lon), round7(el.lat)]
          : el.center
            ? [round7(el.center.lon), round7(el.center.lat)]
            : centroid(toPositions(el.geometry));
      if (point) stations.push({ id, tags: pick(tags, STATION_TAGS), coordinates: point });
    }
  }

  return {
    ...meta,
    osmBaseAt: response.osm3s?.timestamp_osm_base ?? null,
    buildings: sortById(buildings),
    roads: sortById(roads),
    stations: dedupeStations(sortById(stations)),
  };
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** OSM often maps one station as both a railway=station node and a public_transport=station area. */
function dedupeStations(stations: SnapshotStation[]): SnapshotStation[] {
  const kept: SnapshotStation[] = [];
  for (const s of stations) {
    const twin = kept.find(
      (k) =>
        (k.tags["name:en"] ?? k.tags.name) === (s.tags["name:en"] ?? s.tags.name) &&
        Math.abs(k.coordinates[0] - s.coordinates[0]) < 0.0015 &&
        Math.abs(k.coordinates[1] - s.coordinates[1]) < 0.0015,
    );
    if (!twin) {
      kept.push(s);
      continue;
    }
    // Prefer the node (the station's point); fill in any tags the twin lacked.
    if (s.id.startsWith("node/") && !twin.id.startsWith("node/")) {
      kept[kept.indexOf(twin)] = { ...s, tags: { ...twin.tags, ...s.tags } };
    } else {
      twin.tags = { ...s.tags, ...twin.tags };
    }
  }
  return kept;
}

/**
 * Writes the snapshot as JSON with one feature per line, so a re-fetch produces a readable diff.
 */
export function stringifySnapshot(snapshot: SiteSnapshot): string {
  const { buildings, roads, stations, ...meta } = snapshot;
  const list = (items: unknown[]) =>
    items.length === 0
      ? "[]"
      : `[\n${items.map((i) => `    ${JSON.stringify(i)}`).join(",\n")}\n  ]`;
  const head = Object.entries(meta)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(",\n");
  return `{\n${head},\n  "stations": ${list(stations)},\n  "roads": ${list(roads)},\n  "buildings": ${list(buildings)}\n}\n`;
}

const position = z.tuple([z.number(), z.number()]);
const tagsSchema = z.record(z.string(), z.string());
export const siteSnapshotSchema = z.object({
  source: z.string(),
  attribution: z.string(),
  license: z.string(),
  licenseUrl: z.string(),
  fetchedAt: z.iso.datetime(),
  osmBaseAt: z.string().nullable(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  buildings: z.array(
    z.object({
      id: z.string(),
      tags: tagsSchema,
      coordinates: z.array(z.array(z.array(position))),
    }),
  ),
  roads: z.array(
    z.object({ id: z.string(), tags: tagsSchema, coordinates: z.array(z.array(position)) }),
  ),
  stations: z.array(z.object({ id: z.string(), tags: tagsSchema, coordinates: position })),
});
