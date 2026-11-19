# Decisions

Short records of choices made while building. Newest last.

## 1. One Next.js app, backend as a Hono package

The live rules math must run in the browser (a server round trip on every corner drag would lag). Everything else (site data, saving, sharing, reports, keeping keys secret) needs a server. The backend lives in `packages/api` as a Hono app mounted at `/api/*` inside Next.js: one deploy, end-to-end types through `hono/client`, and no lock-in to Next route conventions if it ever moves to its own service.

## 2. Neon Postgres with PostGIS

The product needs spatial queries (which zone contains a point, buildings near a plot, distance to a station). PostGIS does this in the database. Neon is serverless Postgres that supports PostGIS and pairs with Vercel. The project lives in `aws-ap-southeast-1` (Singapore), the closest region to Bangkok. Driver: `pg` Pool through Drizzle's `node-postgres`, because Better Auth may need transactions that Neon's HTTP driver cannot do.

## 3. Guest sessions by default

Reviewers must be able to open the link and use the tool without signing up, and the submission server rejects links behind a sign-in. Better Auth's anonymous plugin gives every visitor a real session with no personal data. OAuth providers can be added later and linked to the guest account.

## 4. Engine is pure TypeScript

`packages/engine` has no framework or I/O imports, so the browser (instant updates) and the server (verifying saved results, reports) run identical code. Saved results will carry `ENGINE_VERSION`.

## 5. Tooling: pnpm, Turborepo, Biome

pnpm workspaces with a version catalog keep every package on the same dependency versions. Turborepo caches builds and tests. Biome replaces ESLint and Prettier with one fast tool.

## 6. Theme: "Blueprint"

Warm stone neutrals with a deep blueprint-blue primary, plus tokens the product needs: pass / fail / warn for rule checklists, an envelope colour, and the Bangkok zoning-map colours (yellow, orange, brown residential; red commercial). Type is IBM Plex Sans with IBM Plex Sans Thai for Thai legal terms, and IBM Plex Mono for figures.

## 7. Dev server on port 3100

Port 3000 is often taken by other local projects. A fixed project port keeps `BETTER_AUTH_URL` stable.

## 8. Engine contract: Zod schemas for inputs, plain types for outputs

Inputs cross trust boundaries (Web Worker messages, API bodies, saved projects, URL state), so they are Zod schemas with types inferred from them: one definition, validated everywhere. Outputs are produced by our own code and recomputed on the server when it matters, so they are plain TypeScript types. Zod is the engine's only dependency; it does no I/O, so the engine stays pure.

## 9. Three building types: condo, office, hotel

In ย.8–ย.10 a condo has no size cap, so with condo alone "change the building type" would change nothing. The 2013 plan gives offices and hotels road-width and station conditions (for example, in ย.8 an office over 2,000 m² of operating area needs a 16 m road or a station within 500 m, and over 10,000 m² is not allowed; a hotel over 50 rooms needs a 16 m road or a station). Offices and hotels are also non-residential, so they need 10% open ground instead of 30% and use different parking rates. Switching type therefore visibly changes the footprint, parking and checklist. Hotel room counts are estimated from floor area rather than asked for.

## 10. Hotels count as non-residential

Thai building law treats hotels as public buildings, not residential buildings, so the 10% open-space rule applies (MR 33 cl. 6, BMA ordinance cl. 52). This is our reading; it is easy to reverse in `BUILDING_TYPE_INFO`.

## 11. "Operating area" approximated by main-use floor area

The plan's office and hotel caps use operating area (พื้นที่ประกอบการ), not total floor area. The engine approximates it as the floor area of the main use, excluding parking and lobby floors (`Design.useAreaM2`). The UI says so.

## 12. Plot edges by index, identity in the UI

The engine takes `edges[i]` for the side from vertex i to vertex i + 1. Terra Draw does not keep stable vertex ids, so inserting a corner shifts indices; the UI store keeps its own vertex ids and rebuilds the edge list. This keeps the engine input simple and serialisable.

## 13. Road sides drawn with MapLibre layers, not deck.gl

Road sides and their labels are flat lines on the ground, which MapLibre's own line and symbol layers draw simply and reliably, with hover and click events for free. deck.gl stays for what needs it: the 3D envelope and designs.

## 14. Sample plot on Soi Sukhumvit 19

The first sample sat across Sukhumvit Road and the Asok intersection, which a reviewer would spot at once. The sample now fronts the real Soi Sukhumvit 19 (its property line placed 5 m from the OpenStreetMap centreline, for an assumed 10 m soi), about 3,500 m² with an irregular back boundary. Width, zone and station distance remain example values.

## 15. Buildings on the plot are hidden

A developer evaluating a plot assumes the existing buildings come down, and leaving them in place would hide the envelope. Basemap buildings whose footprint touches the plot are filtered out by their tile feature ids; neighbours stay. This works with the basemap alone, before the site-data backend exists.

## 16. Sides are edited in a list as well as on the map

Clicking a thin line on a tilted 3D map is fiddly and impossible from a keyboard. The panel lists every side with its length and a "faces" selector (neighbour, an existing road, or a new road); hovering a row highlights the side on the map, and clicking a side on the map selects its row.

## 17. The basemap stays light in dark mode

OpenFreeMap's Liberty style (the one with 3D buildings) has no dark variant. The panel and controls follow the theme; the map does not. Revisit if a dark style with `building-3d` becomes available.

## 18. Site data: a fixed study area from a committed OpenStreetMap snapshot

Site data covers one fixed box, `STUDY_AREA` in `packages/db/src/site-area.ts`: lon 100.547–100.575, lat 13.728–13.752 (about 3.0 × 2.7 km). It spans Phloen Chit to Phrom Phong along Sukhumvit Road, Soi Sukhumvit 1–39 and the Asok–Phetchaburi–Makkasan corridor, with 7 stations (4 BTS, 2 MRT, Airport Rail Link). The design asked for about 2.5 × 2.5 km; it grew to reach Soi 1 in the west and Phetchaburi Road and Makkasan in the north.

The app never calls Overpass or OSM at runtime: the public Overpass servers were overloaded while building this (two of three refused the query), a runtime dependency would be the demo's weakest point, and a server that fetches on request is an SSRF and abuse surface. `pnpm db:seed:fetch` fetches once (three mirrors, exponential backoff, generic User-Agent) and writes `packages/db/seed/asok-osm.json` (1.8 MB, so not gzipped; the script gzips above 5 MB). The snapshot keeps geometry plus only the raw tags the normalisers read, one feature per line, so normalisation can change without re-fetching and a refresh gives a readable diff. `pnpm db:seed` upserts it by OSM id in one transaction and deletes rows of the three site tables that the snapshot no longer contains; it records the source, licence, fetch date and OSM base date in `site_snapshots`. Attribution (© OpenStreetMap contributors, ODbL) travels with every response.

The mirror that answered (overpass.private.coffee) reported an OSM base date of 2026-06-01, so the data is about six months old. Refresh with `pnpm db:seed:fetch && pnpm db:seed` when a fresher server answers.

## 19. Normalising OSM heights and widths

- **Building height**: `height` (units parsed: "45", "45 m", "12,5", feet), else `building:levels` × 3.2 m, else a default by type (1 storey for roofs, sheds, garages; 2 for houses; 3 otherwise). `height_source` records which (`height` / `levels` / `default`) so the UI can show guessed heights differently. Multi-valued tags ("3;4") take the largest value; garbage, zero and absurd values (> 500 m, > 150 storeys) are ignored. Base from `min_height` or `building:min_level` × 3.2 m; a base at or above the top is dropped. In the snapshot 4% of buildings have a tagged height, 20% levels and 76% a default, so many towers near Asok show as 3 storeys; the basemap's own 3D buildings use the same OSM data and have the same gap.
- **Building name** prefers `name:en` over `name`.
- **Road width** is a suggestion; the user enters the legal width. `width` tag → `osm-tag` (only 4 of 1,691 roads have one). Else lanes × 3.25 m + 2 m footpath each side → `osm-estimate`; for a one-way carriageway of a divided trunk, primary or secondary road the lanes are doubled, because the street (and its right-of-way) is both halves. Else a default by class (trunk 40, primary 30, secondary 20, tertiary 14, residential and unclassified 8, links 8, service, living street and pedestrian 6). Soi Sukhumvit 19 comes out at 8–10.5 m, matching the 10 m assumed in decision 14.
- **Roads kept**: carriageways (motorway to service, living street, pedestrian). Footways, steps and paths are dropped, as are service roads tagged `parking_aisle`, `driveway` or `drive-through`, which are not streets.
- **Stations**: `railway=station`, or `public_transport=station` with a rail mode. Mainline halts are excluded (the SRT Asok halt is not mass transit). OSM tags these stations inconsistently (BTS stations as `station=subway`, Asok BTS with the MRT operator, some with no network), so the seven stations' lines are set by OSM id from the operators' line maps (`STATION_LINES`), falling back to `network`, `line`, then the operator.

## 20. Site API

- `GET /api/site/buildings?bbox=w,s,e,n`: a box that only partly overlaps the study area is clipped to it (a map viewport at the area's edge is normal); a box that does not overlap is 400 `outside_study_area`; over 1.2 km² after clipping is 400 `bbox_too_large`. At most 5,000 features, nearest the box centre first, with `truncated: true` when capped (a 1 km² box around Asok holds about 900 buildings, 320 KB).
- `POST /api/site/plot-context`: a plot with any corner outside the study area answers 200 with `insideStudyArea: false` and empty results rather than an error, so the UI can say "no site data here" without special-casing a failure. A plot whose bounding box exceeds 1.2 km² is 400 `plot_too_large`.
- **Side → road matching**: for side i (vertex i → i + 1) take the road segments (from `ST_DumpSegments`) whose geodesic distance to the side's midpoint is within road width / 2 + 12 m and whose geodesic bearing is within 25° of the side's (either direction); the nearest wins. Motorways and their ramps never match (elevated, access-controlled; a plot cannot front them). Corner plots get one road per side.
- **Buildings on the plot**: those with at least 30% of their footprint inside it, so a slightly generous outline does not swallow the neighbours.
- **Nearest station**: geodesic distance from the plot polygon (0 when the station is inside it) to the station point.
- **Limits**: per-client sliding-window rate limit on `/api/site/*` of 120 requests a minute, keyed on the first `x-forwarded-for` address (set by Vercel's edge, which overwrites client values). It lives in process memory, so on Vercel each function instance counts separately and a cold start resets it; it stops casual loops, not a determined attacker. A shared store (Upstash, Vercel KV) or Vercel's WAF rate limiting is the upgrade if needed. Request bodies over 32 KB get 413, measured even when no Content-Length is sent; Hono's own `bodyLimit` could not be used because it re-wraps the request with `new Request(c.req.raw, …)`, which throws on Next's `NextRequest` and turned chunked bodies into 500s (`site-body-limit.ts`). All inputs are zod-validated with strict objects (unknown fields rejected); coordinates must be plain decimals (no exponents, NaN or Infinity). All SQL is drizzle `sql` templates with bound parameters, including the plot GeoJSON and side list; driver errors never reach the client (the app's generic 500).
- **Caching**: GETs send `public, max-age=300, s-maxage=86400, stale-while-revalidate=86400`, since the data only changes on reseed. `plot-context` is `no-store`.
- **Geometry column**: a Drizzle `customType` (`geometry(<Kind>,4326)`) whose writes go through `ST_GeomFromGeoJSON` with a bound parameter (polygons through `ST_MakeValid`, keeping only polygon parts). Reads use `ST_AsGeoJSON` in SQL. GiST index on every geometry column.
