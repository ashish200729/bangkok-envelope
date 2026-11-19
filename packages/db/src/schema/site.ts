import { sql } from "drizzle-orm";
import {
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

type GeometryKind = "MultiPolygon" | "MultiLineString" | "Point";

/**
 * A PostGIS geometry column in WGS 84. Writes take a GeoJSON geometry string and go through
 * ST_GeomFromGeoJSON as a bound parameter; reads should use ST_AsGeoJSON in the query, so the
 * driver value (hex EWKB) is passed through untouched.
 */
const geometry = (kind: GeometryKind) =>
  customType<{ data: string; driverData: string }>({
    dataType: () => `geometry(${kind},4326)`,
    toDriver: (geojson) => {
      const parsed = sql`ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326)`;
      if (kind === "MultiPolygon") {
        // OSM outlines are sometimes self-touching; repair them and keep only the polygon parts.
        return sql`ST_Multi(ST_CollectionExtract(ST_MakeValid(${parsed}), 3))`;
      }
      if (kind === "MultiLineString") return sql`ST_Multi(${parsed})`;
      return parsed;
    },
  });

/** Building footprints from OpenStreetMap, with heights normalised to metres. */
export const siteBuildings = pgTable(
  "site_buildings",
  {
    /** OSM element id, e.g. "way/123" or "relation/45". */
    osmId: text().primaryKey(),
    geom: geometry("MultiPolygon")().notNull(),
    heightM: real().notNull(),
    baseM: real().notNull().default(0),
    /** "height" (tagged), "levels" (building:levels × 3.2 m) or "default" (guessed by type). */
    heightSource: text().notNull(),
    levels: real(),
    kind: text().notNull(),
    name: text(),
  },
  (t) => [index("site_buildings_geom_idx").using("gist", t.geom)],
);

/** Road centrelines from OpenStreetMap, with a suggested right-of-way width. */
export const siteRoads = pgTable(
  "site_roads",
  {
    osmId: text().primaryKey(),
    geom: geometry("MultiLineString")().notNull(),
    /** OSM highway value: primary, secondary, tertiary, residential, service, … */
    class: text().notNull(),
    name: text(),
    nameEn: text(),
    widthM: real().notNull(),
    /** "osm-tag" (OSM width tag) or "osm-estimate" (from lanes or road class). */
    widthSource: text().notNull(),
    lanes: integer(),
  },
  (t) => [index("site_roads_geom_idx").using("gist", t.geom)],
);

/** BTS, MRT and Airport Rail Link stations. */
export const siteStations = pgTable(
  "site_stations",
  {
    osmId: text().primaryKey(),
    name: text().notNull(),
    nameEn: text(),
    network: text(),
    geom: geometry("Point")().notNull(),
  },
  (t) => [index("site_stations_geom_idx").using("gist", t.geom)],
);

/** One row per loaded snapshot: where the site data came from and when. */
export const siteSnapshots = pgTable("site_snapshots", {
  id: text().primaryKey(),
  source: text().notNull(),
  attribution: text().notNull(),
  license: text().notNull(),
  licenseUrl: text().notNull(),
  fetchedAt: timestamp({ withTimezone: true }).notNull(),
  osmBaseAt: timestamp({ withTimezone: true }),
  west: doublePrecision().notNull(),
  south: doublePrecision().notNull(),
  east: doublePrecision().notNull(),
  north: doublePrecision().notNull(),
  counts: jsonb().$type<{ buildings: number; roads: number; stations: number }>().notNull(),
  loadedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
