import { STOREY_HEIGHT_M } from "./site-area";
import type { OsmTags } from "./site-osm";

export type HeightSource = "height" | "levels" | "default";
/** Same values as the engine's `Road.widthSource`; OSM rows never carry "user". */
export type RoadWidthSource = "osm-tag" | "osm-estimate";

const MAX_BUILDING_HEIGHT_M = 500;
const MAX_LEVELS = 150;
const MAX_ROAD_WIDTH_M = 120;
const FEET_TO_M = 0.3048;

/** The values of a possibly multi-valued OSM tag ("3;4"), each trimmed. */
function values(raw: string): string[] {
  return raw
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Parses one OSM length value in metres: "12", "12.5", "12,5", "12 m", "12m", "40 ft", "40'",
 * "12'6\"". Returns null for anything else.
 */
export function parseLength(raw: string): number | null {
  const v = raw.trim().toLowerCase();
  const feetInches = /^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*")?$/.exec(v);
  if (feetInches) {
    return (Number(feetInches[1]) + Number(feetInches[2] ?? 0) / 12) * FEET_TO_M;
  }
  const match = /^(\d+(?:[.,]\d+)?)\s*(m|meters?|metres?|ft|feet)?$/.exec(v);
  if (!match) return null;
  const n = Number((match[1] as string).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return match[2] === "ft" || match[2] === "feet" ? n * FEET_TO_M : n;
}

/** The largest valid length in a possibly multi-valued tag, within (0, max]. */
function parseMaxLength(raw: string | undefined, max: number, allowZero = false): number | null {
  if (raw === undefined) return null;
  const parsed = values(raw)
    .map(parseLength)
    .filter((n): n is number => n !== null && (allowZero ? n >= 0 : n > 0) && n <= max);
  return parsed.length === 0 ? null : Math.max(...parsed);
}

/** Parses building:levels ("12", "3;4" → 4, "12.5"); null for garbage, zero or absurd values. */
export function parseLevels(raw: string | undefined, allowZero = false): number | null {
  if (raw === undefined) return null;
  const parsed = values(raw)
    .map((v) => (/^\d+(?:[.,]\d+)?$/.test(v) ? Number(v.replace(",", ".")) : Number.NaN))
    .filter((n) => Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) && n <= MAX_LEVELS);
  return parsed.length === 0 ? null : Math.max(...parsed);
}

/** Default storeys when OSM has neither height nor levels: small structures low, houses two. */
const DEFAULT_LEVELS: Record<string, number> = {
  roof: 1,
  carport: 1,
  canopy: 1,
  shed: 1,
  hut: 1,
  kiosk: 1,
  garage: 1,
  garages: 1,
  service: 1,
  toilets: 1,
  guardhouse: 1,
  house: 2,
  detached: 2,
  semidetached_house: 2,
  terrace: 2,
  bungalow: 2,
};
export const DEFAULT_BUILDING_LEVELS = 3;

export type NormalizedBuilding = {
  heightM: number;
  baseM: number;
  heightSource: HeightSource;
  levels: number | null;
  kind: string;
  name: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function normalizeBuilding(tags: OsmTags): NormalizedBuilding {
  const kind = tags.building && tags.building !== "yes" ? tags.building : "building";
  const levels = parseLevels(tags["building:levels"]);
  const tagged = parseMaxLength(tags.height, MAX_BUILDING_HEIGHT_M);

  let heightM: number;
  let heightSource: HeightSource;
  if (tagged !== null) {
    heightM = tagged;
    heightSource = "height";
  } else if (levels !== null) {
    heightM = levels * STOREY_HEIGHT_M;
    heightSource = "levels";
  } else {
    heightM = (DEFAULT_LEVELS[kind] ?? DEFAULT_BUILDING_LEVELS) * STOREY_HEIGHT_M;
    heightSource = "default";
  }

  const minHeight = parseMaxLength(tags.min_height, MAX_BUILDING_HEIGHT_M, true);
  const minLevel = parseLevels(tags["building:min_level"], true);
  let baseM = minHeight ?? (minLevel !== null ? minLevel * STOREY_HEIGHT_M : 0);
  // A base at or above the top is a tagging error; standing the building on the ground is safer.
  if (baseM >= heightM) baseM = 0;

  return {
    heightM: round2(heightM),
    baseM: round2(baseM),
    heightSource,
    levels,
    kind,
    name: tags["name:en"] ?? tags.name ?? null,
  };
}

const LANE_WIDTH_M = 3.25;
/** Footpath and drain on each side, so a lane count becomes a right-of-way. */
const VERGES_M = 2 * 2;

/** Typical Bangkok right-of-way by road class, used when OSM has neither width nor lanes. */
const CLASS_WIDTH_M: Record<string, number> = {
  motorway: 30,
  trunk: 40,
  primary: 30,
  secondary: 20,
  tertiary: 14,
  residential: 8,
  unclassified: 8,
  road: 8,
  service: 6,
  living_street: 6,
  pedestrian: 6,
  motorway_link: 8,
  trunk_link: 8,
  primary_link: 8,
  secondary_link: 8,
  tertiary_link: 8,
};
const DIVIDED_CLASSES = new Set(["trunk", "primary", "secondary"]);

export type NormalizedRoad = {
  roadClass: string;
  name: string | null;
  nameEn: string | null;
  widthM: number;
  widthSource: RoadWidthSource;
  lanes: number | null;
};

export function normalizeRoad(tags: OsmTags): NormalizedRoad {
  const roadClass = tags.highway ?? "road";
  const lanes = parseLevels(tags.lanes);
  const width = parseMaxLength(tags.width, MAX_ROAD_WIDTH_M);
  const base = {
    roadClass,
    name: tags.name ?? null,
    nameEn: tags["name:en"] ?? null,
    lanes: lanes === null ? null : Math.round(lanes),
  };
  if (width !== null) return { ...base, widthM: round2(width), widthSource: "osm-tag" };
  if (lanes !== null) {
    // One-way halves of a divided main road count only their own lanes; the street has both.
    const total = tags.oneway === "yes" && DIVIDED_CLASSES.has(roadClass) ? lanes * 2 : lanes;
    return {
      ...base,
      widthM: round2(total * LANE_WIDTH_M + VERGES_M),
      widthSource: "osm-estimate",
    };
  }
  return { ...base, widthM: CLASS_WIDTH_M[roadClass] ?? 8, widthSource: "osm-estimate" };
}

export type NormalizedStation = { name: string; nameEn: string | null; network: string | null };

/**
 * Line names for the study area's stations, keyed by OSM id. OSM tags these inconsistently (BTS
 * stations as station=subway, Asok BTS with the MRT operator, several with no network), so the
 * line is set from the operators' published line maps instead.
 */
const STATION_LINES: Record<string, string> = {
  "node/5391631777": "BTS Sukhumvit Line", // Phloen Chit
  "node/5391628766": "BTS Sukhumvit Line", // Nana
  "node/5391625873": "BTS Sukhumvit Line", // Asok
  "node/5391626093": "BTS Sukhumvit Line", // Phrom Phong
  "node/5391691787": "MRT Blue Line", // Sukhumvit
  "node/12805950167": "MRT Blue Line", // Phetchaburi
  "node/6711023184": "Airport Rail Link", // Makkasan
};

const OPERATOR_NETWORKS: Record<string, string> = {
  ระบบขนส่งมวลชนกรุงเทพ: "BTS",
  ทางด่วนและรถไฟฟ้ากรุงเทพ: "MRT",
};

export function normalizeStation(osmId: string, tags: OsmTags): NormalizedStation {
  const fromOperator = tags.operator ? OPERATOR_NETWORKS[tags.operator] : undefined;
  return {
    name: tags.name ?? tags["name:en"] ?? "Station",
    nameEn: tags["name:en"] ?? null,
    network: STATION_LINES[osmId] ?? tags.network ?? tags.line ?? fromOperator ?? null,
  };
}
