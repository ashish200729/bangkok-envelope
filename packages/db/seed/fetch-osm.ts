/**
 * Fetches the study area from OpenStreetMap once, through the Overpass API, and writes the
 * committed snapshot that `load-site.ts` inserts into PostGIS. The app never calls Overpass.
 *
 *   pnpm --filter @envelope/db seed:fetch
 */
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { OSM_ATTRIBUTION, OSM_LICENSE, OSM_LICENSE_URL, STUDY_AREA } from "../src/site-area";
import { overpassResponseSchema, snapshotFromOverpass, stringifySnapshot } from "../src/site-osm";
import { SNAPSHOT_GZ_PATH, SNAPSHOT_PATH } from "./paths";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const MAX_ATTEMPTS = 12;
const GZIP_ABOVE_BYTES = 5 * 1024 * 1024;

const [w, s, e, n] = STUDY_AREA.bbox;
const QUERY = `[out:json][timeout:300][bbox:${s},${w},${n},${e}];
(
  way["building"];
  relation["building"]["type"="multipolygon"];
  way["highway"];
);
out geom;
(
  nwr["railway"~"^(station|halt)$"];
  nwr["public_transport"="station"];
);
out center tags;`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOverpass(): Promise<unknown> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length] as string;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "bangkok-envelope-seed/1.0 (one-off snapshot)",
        },
        body: new URLSearchParams({ data: QUERY }),
        signal: AbortSignal.timeout(330_000),
      });
      const text = await res.text();
      if (!res.ok)
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 120).replace(/\s+/g, " ")}`);
      const json: unknown = JSON.parse(text);
      // Overpass reports timeouts and memory errors inside a 200 response.
      if (typeof json === "object" && json !== null && "remark" in json) {
        throw new Error(`Overpass remark: ${String((json as { remark: unknown }).remark)}`);
      }
      console.warn(`fetched from ${endpoint}`);
      return json;
    } catch (error) {
      const wait = Math.min(120_000, 5_000 * 2 ** Math.floor(attempt / ENDPOINTS.length));
      console.warn(
        `attempt ${attempt + 1} at ${endpoint} failed (${error instanceof Error ? error.message : error}); retrying in ${wait / 1000}s`,
      );
      await sleep(wait);
    }
  }
  throw new Error("Every Overpass endpoint failed; try again later");
}

const fetchedAt = new Date().toISOString();
const response = overpassResponseSchema.parse(await fetchOverpass());
const snapshot = snapshotFromOverpass(response, {
  bbox: STUDY_AREA.bbox,
  fetchedAt,
  source: "OpenStreetMap, fetched through the Overpass API",
  attribution: OSM_ATTRIBUTION,
  license: OSM_LICENSE,
  licenseUrl: OSM_LICENSE_URL,
});
const text = stringifySnapshot(snapshot);
const bytes = Buffer.byteLength(text);
if (bytes > GZIP_ABOVE_BYTES) {
  await writeFile(SNAPSHOT_GZ_PATH, gzipSync(text, { level: 9 }));
  console.warn(`wrote ${SNAPSHOT_GZ_PATH} (${(bytes / 1e6).toFixed(1)} MB before gzip)`);
} else {
  await writeFile(SNAPSHOT_PATH, text);
  console.warn(`wrote ${SNAPSHOT_PATH} (${(bytes / 1e6).toFixed(1)} MB)`);
}
console.warn(
  `buildings ${snapshot.buildings.length}, roads ${snapshot.roads.length}, stations ${snapshot.stations.length}, OSM base ${snapshot.osmBaseAt}`,
);
