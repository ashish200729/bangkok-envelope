/**
 * Inserts the committed OpenStreetMap snapshot into PostGIS. Idempotent: rows are upserted by
 * OSM id, and rows of the site tables that the snapshot no longer contains are deleted.
 *
 *   pnpm db:seed
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { sql } from "drizzle-orm";
import { db } from "../src/client";
import { siteBuildings, siteRoads, siteSnapshots, siteStations } from "../src/schema/site";
import { STUDY_AREA } from "../src/site-area";
import { normalizeBuilding, normalizeRoad, normalizeStation } from "../src/site-normalize";
import { isRailStation, siteSnapshotSchema } from "../src/site-osm";
import { SNAPSHOT_GZ_PATH, SNAPSHOT_PATH } from "./paths";

const BATCH = 500;

async function readSnapshot() {
  if (existsSync(SNAPSHOT_GZ_PATH)) return gunzipSync(await readFile(SNAPSHOT_GZ_PATH)).toString();
  return readFile(SNAPSHOT_PATH, "utf8");
}

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += BATCH) out.push(items.slice(i, i + BATCH));
  return out;
}

const snapshot = siteSnapshotSchema.parse(JSON.parse(await readSnapshot()));

const buildings = snapshot.buildings.map((b) => {
  const n = normalizeBuilding(b.tags);
  return {
    osmId: b.id,
    geom: JSON.stringify({ type: "MultiPolygon", coordinates: b.coordinates }),
    heightM: n.heightM,
    baseM: n.baseM,
    heightSource: n.heightSource,
    levels: n.levels,
    kind: n.kind,
    name: n.name,
  };
});
const roads = snapshot.roads.map((r) => {
  const n = normalizeRoad(r.tags);
  return {
    osmId: r.id,
    geom: JSON.stringify({ type: "MultiLineString", coordinates: r.coordinates }),
    class: n.roadClass,
    name: n.name,
    nameEn: n.nameEn,
    widthM: n.widthM,
    widthSource: n.widthSource,
    lanes: n.lanes,
  };
});
const stations = snapshot.stations
  .filter((s) => isRailStation(s.tags))
  .map((s) => ({
    osmId: s.id,
    geom: JSON.stringify({ type: "Point", coordinates: s.coordinates }),
    ...normalizeStation(s.id, s.tags),
  }));

if (buildings.length === 0 || roads.length === 0 || stations.length === 0) {
  throw new Error("The snapshot is missing buildings, roads or stations; refusing to load it");
}

const excluded = (column: string) => sql.raw(`excluded."${column}"`);

await db.transaction(async (tx) => {
  for (const batch of chunks(buildings)) {
    await tx
      .insert(siteBuildings)
      .values(batch)
      .onConflictDoUpdate({
        target: siteBuildings.osmId,
        set: {
          geom: excluded("geom"),
          heightM: excluded("height_m"),
          baseM: excluded("base_m"),
          heightSource: excluded("height_source"),
          levels: excluded("levels"),
          kind: excluded("kind"),
          name: excluded("name"),
        },
      });
  }
  for (const batch of chunks(roads)) {
    await tx
      .insert(siteRoads)
      .values(batch)
      .onConflictDoUpdate({
        target: siteRoads.osmId,
        set: {
          geom: excluded("geom"),
          class: excluded("class"),
          name: excluded("name"),
          nameEn: excluded("name_en"),
          widthM: excluded("width_m"),
          widthSource: excluded("width_source"),
          lanes: excluded("lanes"),
        },
      });
  }
  for (const batch of chunks(stations)) {
    await tx
      .insert(siteStations)
      .values(batch)
      .onConflictDoUpdate({
        target: siteStations.osmId,
        set: {
          geom: excluded("geom"),
          name: excluded("name"),
          nameEn: excluded("name_en"),
          network: excluded("network"),
        },
      });
  }

  // Rows from an older snapshot that OSM has since deleted. Only these three tables are touched.
  const keep = (rows: { osmId: string }[]) => JSON.stringify(rows.map((r) => r.osmId));
  await tx.execute(sql`
    delete from site_buildings
    where osm_id not in (select jsonb_array_elements_text(${keep(buildings)}::jsonb))
  `);
  await tx.execute(sql`
    delete from site_roads where osm_id not in (select jsonb_array_elements_text(${keep(roads)}::jsonb))
  `);
  await tx.execute(sql`
    delete from site_stations
    where osm_id not in (select jsonb_array_elements_text(${keep(stations)}::jsonb))
  `);

  const [w, s, e, n] = snapshot.bbox;
  const row = {
    id: STUDY_AREA.id,
    source: snapshot.source,
    attribution: snapshot.attribution,
    license: snapshot.license,
    licenseUrl: snapshot.licenseUrl,
    fetchedAt: new Date(snapshot.fetchedAt),
    osmBaseAt: snapshot.osmBaseAt ? new Date(snapshot.osmBaseAt) : null,
    west: w,
    south: s,
    east: e,
    north: n,
    counts: { buildings: buildings.length, roads: roads.length, stations: stations.length },
    loadedAt: new Date(),
  };
  await tx
    .insert(siteSnapshots)
    .values(row)
    .onConflictDoUpdate({ target: siteSnapshots.id, set: row });
});

const share = (source: string) =>
  `${((100 * buildings.filter((b) => b.heightSource === source).length) / buildings.length).toFixed(1)}%`;
console.warn(
  `loaded ${buildings.length} buildings (height ${share("height")}, levels ${share("levels")}, default ${share("default")}), ` +
    `${roads.length} roads (${roads.filter((r) => r.widthSource === "osm-tag").length} with a width tag), ` +
    `${stations.length} stations`,
);
await db.$client.end();
