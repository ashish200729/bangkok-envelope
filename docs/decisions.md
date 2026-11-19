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

OpenFreeMap's Liberty style (the one with 3D buildings) has no dark variant. Superseded by decision 42: the same layers are recoloured at runtime, light or dark.

## 18. Two envelopes: low-rise and high-rise

A building under 23 m and a high-rise obey different distances at the same low heights. A low-rise may come within 2 m of a neighbour at its ground floor (3 m above 9 m) and within the road setback of the road; every part of a high-rise, ground floors included, must stay 6 m from neighbouring plots and from the road (MR 33 cl. 4). One envelope that switched to 6 m only above 23 m would show a shape no legal building can fill: a 6 m-clear tower standing on a podium that is only 2 m clear. So the result carries `envelopes.lowRise` (0 to 23 m) and `envelopes.highRise` (from the ground up, 6 m clear everywhere), and `highRise: { allowed, checks, maxGfaM2 }` moved to the result level because it describes the site, not one envelope. `envelopes.highRise` is null exactly when `highRise.allowed` is false: the site fails the access test (road ≥ 10 m with ≥ 12 m of frontage on it, MR 33 cl. 2) while the gate is on, or nothing is left at 23 m after the clearance (a 12 m wide plot). The 18 m road needed above 30,000 m² is reported as `maxGfaM2: 30000` on narrower roads rather than as a geometric cut. Heights are half-open: a slice is valid for z0 ≤ z < z1, and the low-rise envelope's top of 23 m means "below 23 m".

## 19. Cuts use true distance to each side, built from stadiums

Region(z) = plot minus, for each side, every point closer than that side's distance d_i(z). A strip along the side's infinite line would over-cut at concave corners (the line runs on into the plot), and an inward polygon offset cannot give each side its own distance. So each side is cut by a stadium (the set of points within d of the segment), built by hand rather than with Clipper's open-path inflate so the arcs can be circumscribed: every chord is tangent to the true circle, so the cut always contains the true one and the remaining footprint is never closer than d. The over-cut is at most 3 cm, only along round caps. Clipper2 (`clipper2-ts`) then subtracts the stadiums in integer units of 0.1 mm; distances hold to within 2 mm (tested at a reflex corner and over 200 random plots). A band [z0, z1) uses distances at z1, its strictest point, since every distance grows with height.

## 20. Envelope bands are computed incrementally and merged

Bands are 1 m tall up to a computational ceiling of 300 m (no law in scope caps height; with the road plane off nothing else would stop the high-rise envelope). Each band starts from the band below and subtracts only the stadiums whose distance grew, which is the same set because cuts only grow; regions are cached by their per-side distances, so identical bands cost nothing. Consecutive bands whose footprints match within 0.01 m² merge into one slice that keeps the upper band's footprint (the stricter one). The envelope stops at the first band with less than 1 m². A 10-corner plot evaluates in about 4–5 ms on a laptop (random 10-corner plots on a 30 m road: mean 5 ms, worst 10 ms).

## 21. Toggles, corner plots and frontage

- The high-rise 6 m clearance follows the setback toggles, not the high-rise gate: on road sides `roadSetback`, on neighbour sides `boundarySetback`. Then every toggle has one visible effect: the two setback toggles widen both envelopes, `roadHeightPlane` changes the top, and `highRiseGate` only decides whether a site that fails the access test still gets a high-rise envelope (its checks still show the real failure, and the 30,000 m² cap is lifted with it). `openSpace` changes no geometry; it marks the open-space and OSR rules as switched off for the design checks.
- Corner plots: each road side applies its own height plane, so a point must satisfy every road it faces. This is stricter than the "nearest road" reading noted in AGENTS.md: near a corner where a narrow soi meets a wide road, points closer to the wide road are still held to the soi's plane. It is conservative, simple to explain, and only differs in a small wedge near the corner; revisit if a reviewer or architect reads cl. 49 the other way.
- Frontage is the total length of plot sides facing one road, because the map may split one frontage into several sides. A frontage within 1 cm of 12 m counts as 12 m, so a side drawn at exactly 12 m does not fail on map rounding.
- The rules list repeats `setback.road` and `height.roadPlane` once per road (with the road named in `note`), and lists both neighbour distances (2 m and 3 m). Each line carries `enabled`, false when its toggle is off.
- Use-size caps (offices by operating area, hotels by rooms) are checked against the widest road the plot faces; a station counts when `stationDistanceM` ≤ 500.

## 22. Live measurements while drawing and editing

A developer checks a plot against the title deed and the site, so every side shows its length while it is drawn and edited, the side under the pointer also shows its compass bearing, each corner its interior angle, and a HUD shows perimeter and area (m² and rai/ngan/wah). Labels are native MapLibre symbols on a GeoJSON source updated once per animation frame, not React markers, so they cost nothing between frames and take part in MapLibre's collision handling. Labels are horizontal pills placed beside the outline (lengths outside, angles inside), not along the line, because short sides cannot fit text along them. Corners under 15° are flagged: they are almost always a misplaced click.

## 23. Site data: a fixed study area from a committed OpenStreetMap snapshot

Site data covers one fixed box, `STUDY_AREA` in `packages/db/src/site-area.ts`: lon 100.547–100.575, lat 13.728–13.752 (about 3.0 × 2.7 km). It spans Phloen Chit to Phrom Phong along Sukhumvit Road, Soi Sukhumvit 1–39 and the Asok–Phetchaburi–Makkasan corridor, with 7 stations (4 BTS, 2 MRT, Airport Rail Link). The design asked for about 2.5 × 2.5 km; it grew to reach Soi 1 in the west and Phetchaburi Road and Makkasan in the north.

The app never calls Overpass or OSM at runtime: the public Overpass servers were overloaded while building this (two of three refused the query), a runtime dependency would be the demo's weakest point, and a server that fetches on request is an SSRF and abuse surface. `pnpm db:seed:fetch` fetches once (three mirrors, exponential backoff, generic User-Agent) and writes `packages/db/seed/asok-osm.json` (1.8 MB, so not gzipped; the script gzips above 5 MB). The snapshot keeps geometry plus only the raw tags the normalisers read, one feature per line, so normalisation can change without re-fetching and a refresh gives a readable diff. `pnpm db:seed` upserts it by OSM id in one transaction and deletes rows of the three site tables that the snapshot no longer contains; it records the source, licence, fetch date and OSM base date in `site_snapshots`. Attribution (© OpenStreetMap contributors, ODbL) travels with every response.

The mirror that answered (overpass.private.coffee) reported an OSM base date of 2026-06-01, so the data is about six months old. Refresh with `pnpm db:seed:fetch && pnpm db:seed` when a fresher server answers.

## 24. Normalising OSM heights and widths

- **Building height**: `height` (units parsed: "45", "45 m", "12,5", feet), else `building:levels` × 3.2 m, else a default by type (1 storey for roofs, sheds, garages; 2 for houses; 3 otherwise). `height_source` records which (`height` / `levels` / `default`) so the UI can show guessed heights differently. Multi-valued tags ("3;4") take the largest value; garbage, zero and absurd values (> 500 m, > 150 storeys) are ignored. Base from `min_height` or `building:min_level` × 3.2 m; a base at or above the top is dropped. In the snapshot 4% of buildings have a tagged height, 20% levels and 76% a default, so many towers near Asok show as 3 storeys; the basemap's own 3D buildings use the same OSM data and have the same gap.
- **Building name** prefers `name:en` over `name`.
- **Road width** is a suggestion; the user enters the legal width. `width` tag → `osm-tag` (only 4 of 1,691 roads have one). Else lanes × 3.25 m + 2 m footpath each side → `osm-estimate`; for a one-way carriageway of a divided trunk, primary or secondary road the lanes are doubled, because the street (and its right-of-way) is both halves. Else a default by class (trunk 40, primary 30, secondary 20, tertiary 14, residential and unclassified 8, links 8, service, living street and pedestrian 6). Soi Sukhumvit 19 comes out at 8–10.5 m, matching the 10 m assumed in decision 14.
- **Roads kept**: carriageways (motorway to service, living street, pedestrian). Footways, steps and paths are dropped, as are service roads tagged `parking_aisle`, `driveway` or `drive-through`, which are not streets.
- **Stations**: `railway=station`, or `public_transport=station` with a rail mode. Mainline halts are excluded (the SRT Asok halt is not mass transit). OSM tags these stations inconsistently (BTS stations as `station=subway`, Asok BTS with the MRT operator, some with no network), so the seven stations' lines are set by OSM id from the operators' line maps (`STATION_LINES`), falling back to `network`, `line`, then the operator.

## 25. Site API

- _Removed in decision 34:_ `GET /api/site/buildings?bbox=w,s,e,n`, buildings on the plot, and the 1.2 km² plot limit (now 0.25 km²). The rate limit below now covers the whole API (decision 36).
- `GET /api/site/buildings?bbox=w,s,e,n`: a box that only partly overlaps the study area is clipped to it (a map viewport at the area's edge is normal); a box that does not overlap is 400 `outside_study_area`; over 1.2 km² after clipping is 400 `bbox_too_large`. At most 5,000 features, nearest the box centre first, with `truncated: true` when capped (a 1 km² box around Asok holds about 900 buildings, 320 KB).
- `POST /api/site/plot-context`: a plot with any corner outside the study area answers 200 with `insideStudyArea: false` and empty results rather than an error, so the UI can say "no site data here" without special-casing a failure. A plot whose bounding box exceeds 1.2 km² is 400 `plot_too_large`.
- **Side → road matching**: for side i (vertex i → i + 1) take the road segments (from `ST_DumpSegments`) whose geodesic distance to the side's midpoint is within road width / 2 + 12 m and whose geodesic bearing is within 25° of the side's (either direction); the nearest wins. Motorways and their ramps never match (elevated, access-controlled; a plot cannot front them). Corner plots get one road per side.
- **Buildings on the plot**: those with at least 30% of their footprint inside it, so a slightly generous outline does not swallow the neighbours.
- **Nearest station**: geodesic distance from the plot polygon (0 when the station is inside it) to the station point.
- **Limits**: per-client sliding-window rate limit on `/api/site/*` of 120 requests a minute, keyed on the first `x-forwarded-for` address (set by Vercel's edge, which overwrites client values). It lives in process memory, so on Vercel each function instance counts separately and a cold start resets it; it stops casual loops, not a determined attacker. A shared store (Upstash, Vercel KV) or Vercel's WAF rate limiting is the upgrade if needed. Request bodies over 32 KB get 413, measured even when no Content-Length is sent; Hono's own `bodyLimit` could not be used because it re-wraps the request with `new Request(c.req.raw, …)`, which throws on Next's `NextRequest` and turned chunked bodies into 500s (`site-body-limit.ts`). All inputs are zod-validated with strict objects (unknown fields rejected); coordinates must be plain decimals (no exponents, NaN or Infinity). All SQL is drizzle `sql` templates with bound parameters, including the plot GeoJSON and side list; driver errors never reach the client (the app's generic 500).
- **Caching**: GETs send `public, max-age=300, s-maxage=86400, stale-while-revalidate=86400`, since the data only changes on reseed. `plot-context` is `no-store`.
- **Geometry column**: a Drizzle `customType` (`geometry(<Kind>,4326)`) whose writes go through `ST_GeomFromGeoJSON` with a bound parameter (polygons through `ST_MakeValid`, keeping only polygon parts). Reads use `ST_AsGeoJSON` in SQL. GiST index on every geometry column.

## 26. Site data in the panel: what is applied and what is only suggested

`POST /api/site/plot-context` runs 350 ms after the plot stops changing (never while drawing); a newer geometry aborts the older request. Results are keyed by the vertex ids they were asked for, so a reply never lands on the wrong side.

- **Applied without asking, once per plot**: when a new plot (all sides neighbour) gets its first result, every side matched to a road is marked as facing it, one road per named street (OSM ways with the same name and rounded width share a road, decision 41; unnamed ways get one each), named `name:en` → `name` → "Unnamed <class> road", width rounded to 0.5 m with OSM's `widthSource`. Service roads are never marked automatically (mostly private lanes and car parks; a wrong road side loosens setbacks and the height plane); they appear as suggestions. If the user marks a side before the result arrives, nothing is applied.
- **Only suggested, with Apply**: neighbour sides matched later ("Faces Sukhumvit Road?") and roads whose name or width differ from OSM ("OSM suggests Soi Sukhumvit 19 · 8 m (estimated from road type)"). The sample keeps its hand-set 10 m road.
- **Station distance** follows the detected station until the user types a value; "Use detected" goes back. A new plot (none of its corners kept) returns it to detected. Outside the study area a detected value is cleared.
- Errors and plots outside the study area are inline notices in the panel, never toasts. Request state, auto-mark and station provenance live in `lib/site/store.ts`; the plot store only gained `updateSiteRoads`.

## 27. Three concept designs, each a different trade-off

- **A, Mid-rise**: a straight block below 23 m in the low-rise envelope. Every floor has one outline: the low-rise region at the block's top (its strictest height), capped to the open-ground footprint. The brief allowed each floor to take its own band; a straight block is what a developer would build under 23 m, and it keeps A distinct from C. Each block height is tried, since a taller block may get a smaller plate where the road plane bites.
- **B, Podium + tower**: in the high-rise envelope (6 m clear from the ground up). Podium = lobby + parking floors filling the region, capped to the open-ground footprint. Tower = a rectangle of the use's target plate (condo 1,100, office 1,500, hotel 1,000 m²), long side along or across the longest road frontage, in proportions 1–2.5, centred on the podium's deepest point or slid up to 12 m away from that road; the candidate keeping the most area on the podium plus at the tower's estimated mid-height (where the road plane may cut) wins. Each tower floor is that rectangle clipped to its band, so a tower on a narrow road tapers. Tower floors stop at the caps, the envelope top, or under 250 m². B is dropped if it cannot reach 23 m.
- **C, Stepped**: every floor as large as its own band allows, in the low-rise or (if allowed) high-rise envelope, whichever holds more floor area. Dropped when it repeats A (same floor count, floor area within 0.5%) and B exists, so the user does not see the same building twice; when B cannot exist (a plot under ~12 m wide at 23 m) A and C are both shown.
- Order A, B, C. A plot whose low-rise region cannot hold a 50 m² floor gets no designs (envelope only); in the property test every plot with more than 400 m² of low-rise ground got at least two.

## 28. Floor plates, partial floors and the envelope check

- A floor occupying [z0, z1) is cut to the envelope slice holding z1 (its strictest point), intersected with the floor below, so no floor overhangs a smaller one. Slices nest, so this also lies within every lower slice.
- If a plate splits, the floor keeps its largest piece; `Floor.outline` stays a single `Polygon` (no contract change).
- The open-ground footprint cap and the partial top floor both shrink a plate by an even inward offset (Clipper, mitred), binary-searched on the distance until the area is at most the target (within 0.5 m²), then intersected with the original, so trimming can never step outside it.
- `envelope.fit` is measured: for each floor, Clipper's difference against every slice the floor spans (worst slice counts), plus the whole floor when its top passes the envelope's top (or reaches 23 m for a low-rise). Pass below 0.05 m² (rounding). The high-rise design that fails the access test is checked against the geometry it was built in (the gate-off high-rise envelope).

## 29. Parking: whole floors, counted in floor area, lobby first

- Parking floor area counts towards FAR (2013 plan definition; only extra public parking near stations is exempt, cl. 54), so a design solves use area + parking area + lobby ≤ the floor-area cap.
- Parking floors are whole floors at the bottom: a partial parking floor under full floors above would make the upper floors overhang it. Spare spaces are reported in `providedSpaces` (≥ `requiredSpaces`).
- Ground floor: a 4.5 m lobby. Parking moves onto the ground floor (3 m) only when no lobby layout can meet the parking rule, as on small plots.
- Required spaces (MR 7 cl. 3(1)): the larger of the use's rate (condo 1 per unit over 60 m², which is none with ~45 m² units; office 1 per 60 m² from 300 m²; hotel 10 for the first 30 rooms, 1 per 5 to 100, 1 per 10 beyond) and, for a large building, 1 per 120 m² of floor area outside the parking floors (our reading of "building area", which also avoids parking needing parking). 27 m² gross per space.
- The optimiser tries footprints and numbers of parking floors (0–12) and keeps the layout with the most main-use area that meets parking; if none can, the one with the most area, and the parking check fails.

## 30. OSR and open ground shape the footprint

OSR is open ground ÷ total floor area, so it caps floor area at (plot − footprint) ÷ OSR. At full FAR in ย.10 (8 × 4% = 32%) a footprint at the 30% open-ground limit would fail OSR. When OSR binds, the optimiser also tries the footprint that leaves room for the full FAR (plot − OSR × cap) and one half-way, and keeps the best. With `openSpace` off, neither cap applies and both checks read "Switched off".

## 31. A high-rise that the site may not hold is still shown

If the access gate fails (road under 10 m or frontage under 12 m), `envelopes.highRise` stays null, but `analyseSite` also returns `highRiseGeometry` (the high-rise slices as if the gate were off) and B is built in it, failing `highRise.road` / `highRise.frontage` with the site's own messages. The 30,000 m² cap applies to B whenever the gate is on and no road of 18 m with 12 m of frontage exists; `highRise.largeRoad` passes while the design stays under 30,000 m². With the gate off the three access checks are "n/a". Designs keep within the plan's office and hotel size caps (hotel rooms = use area ÷ 70 m²), so those checks pass; the cap shows in the checklist.

## 32. EIA is a warning, not a fail

The MNRE notification asks for an EIA report for condos and hotels of 80 units/rooms or 4,000 m², and other buildings of 23 m or 10,000 m² (`EIA_RULES`, law id `eia`, https://www.onep.go.th/eia/). It is a process step before the permit, not a refusal, so the check is "warn" when a design reaches a threshold and "pass" otherwise; it never makes `passes` false. The clause is cited as "annex" because we have not verified the item number in the current notification.

## 33. Designs stay inside the live-update budget

Plates are memoised per slice and per plate below, so the many programs the optimiser tries share their Clipper work, and floors within one slice reuse the plate below. Number formatting uses cached `Intl.NumberFormat`s (`toLocaleString` built one per call and showed up in profiles). On a laptop a 10-corner plot evaluates, envelopes and three designs included, in a median of about 12–20 ms warm (condo 12, hotel 16, office 20; the sample plot 2–6 ms); the test bound is a generous 100 ms.

## 34. Less API surface: no buildings route, no buildings on the plot

A security review found two expensive, unused paths. `GET /api/site/buildings?bbox=` served up to 5,000 building polygons per request and nothing in the app called it (the map draws buildings from the basemap's vector tiles). `buildingsOnPlot` in `POST /api/site/plot-context` ran `ST_Intersection` against every building the plot touched, the costliest query per request, and the client ignored it (it hides on-plot buildings from the vector tiles itself, decision 15). Both are gone, with their parser, limits, types and tests. The `site_buildings` table and its seed stay for a later feature; a future route needs a bounded query, the statement timeout (decision 35) and a test.

`MAX_PLOT_BBOX_KM2` drops from 1.2 to 0.25 km² ("draw a plot within about 500 m"): a 500 m square is far beyond any development plot in ย.8–ย.10, and it caps how many roads the side-matching query scans.

## 35. Statement timeout through Neon's pooler

Every request-path query runs inside `withStatementTimeout` (`packages/db/src/statement-timeout.ts`): one transaction that first runs `SET LOCAL statement_timeout = '3000ms'`, so a slow or pathological plot is cancelled by Postgres (SQLSTATE 57014) and the API answers a generic 500. The pooled Neon URL goes through PgBouncer in transaction mode, which ignores startup options (`options=-c statement_timeout=…`), and a plain `SET` would stay on the server connection for the next client; `SET LOCAL` ends with the transaction. A transaction holds one connection, so `getPlotContext`'s two queries now run one after the other instead of in parallel; with the buildings query gone that costs little. `getSnapshotInfo` is cheap but bounded the same way. The integration test checks the setting, a cancelled `pg_sleep`, and that the setting does not leak.

## 36. Rate limits on the whole API, and their serverless caveat

The sliding-window limiter moved from the site routes into `createApp`, so it covers every `/api/*` request (health, me, site, auth and unknown paths): 120 a minute per client IP. `POST /api/auth/sign-in/anonymous` has a second, stricter limit of 10 per 10 minutes, applied before Better Auth runs, because each call writes a user and a session row. Better Auth's own limiter is switched on as well (`rateLimit.enabled`, memory storage, a `customRules` entry for `/sign-in/anonymous` with the same 10 per 600 s); it is defence in depth if the auth handler is ever mounted elsewhere. Better Auth reads only a single-address `x-forwarded-for`, which is what Vercel sends.

Caveat: both limiters keep their counts in process memory. On Vercel every function instance has its own counts and a cold start resets them, so the real ceiling is the limit times the number of warm instances. They stop a loop from one client, not a distributed attacker. The upgrade is a shared store (Upstash Redis via Better Auth's `customStorage` and a Redis-backed limiter here) or Vercel's WAF rate-limit rules in front of `/api/*`; neither is set up yet.

## 37. Production health says only "up"

In production `GET /api/health` answers `{ status, database: { ok } }` (200 or 503, `no-store`): no Postgres, PostGIS or engine versions, timings or driver errors, which only help fingerprint the stack. Outside production it keeps the detailed body the `/status` page shows. The switch is `exposeDetails` in `createApp`'s deps, set from `NODE_ENV` in `packages/api/src/index.ts`, so tests cover both without touching `process.env`. The production summary is a middleware in front of the typed route, so `AppType` keeps the detailed shape the dev page reads. `/status` itself returns 404 in production; the e2e status tests run against the dev server. The Next route file exports only `GET` and `POST`, so other methods never reach Hono.

## 38. Security headers and the Content Security Policy

`apps/web/next.config.ts` sends on every route: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`, `Cross-Origin-Opener-Policy: same-origin`, and an enforced CSP:

`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tiles.openfreemap.org; font-src 'self' data:; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self' blob:; child-src blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`

- `'unsafe-inline'` in `script-src` because Next's App Router inlines its bootstrap and flight data; nonces would make every page dynamic. `'unsafe-eval'` is added only in development (React refresh).
- MapLibre loads its style, tiles, glyphs and sprites from tiles.openfreemap.org and starts its worker from a `blob:` URL.
- Checked in Chrome against a production build: the map canvas renders, the plot context loads, no CSP violations in the console; the full e2e suite passes against the dev server with the dev policy. deck.gl is not on the page yet; if it (or loaders.gl) needs WebAssembly, add `'wasm-unsafe-eval'` to `script-src` and check again.

## 39. The engine in a Web Worker under the CSP, and Zod without eval

The engine runs in a module Web Worker (`apps/web/src/lib/engine/engine.worker.ts`, created with `new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" })`). Turbopack serves it from `/_next/static/chunks/` in development and in production, so `worker-src 'self'` covers it; deck.gl 9.4 with luma.gl draws the envelope and designs without WebAssembly or eval. No CSP directive was added. Checked in Chrome against `next build && next start` (no `SKIP_ENV_VALIDATION`): no `securitypolicyviolation` events in the page or the worker.

One violation did show up: Zod 4 probes for eval with `Function("")` when it builds its first object schema, to decide whether to compile faster parsers. The probe is caught (Zod falls back to its normal parser), but Chrome reports it. `apps/web/src/lib/engine/zod-jitless.ts` calls `config({ jitless: true })`; it is imported by `src/instrumentation-client.ts`, which Next runs before any app code, and first in the worker's `handle.ts`, so the probe never runs. Validation is unchanged. Adding `'unsafe-eval'` to allow the probe would have been the wrong trade.

If the worker cannot start (an old browser or a stricter embedder), the runner evaluates on the main thread instead (`runner.ts`), with the same input validation.

## 40. How the envelope and designs are drawn

- One `MapLibreOverlay` (interleaved, so it shares the depth buffer with the basemap's 3D buildings), created once after the map loads; layers are replaced through `setProps` with stable ids and data memoised per result object, so dragging a corner rebuilds attributes only when a new result arrives. Layers sit before `plot-sides-road`, so the plot outline, corner handles and labels stay on top for editing.
- Each envelope slice is a `SolidPolygonLayer` polygon whose vertices carry z = `z0M` and whose elevation is `z1M − z0M`: deck.gl's side shader puts the bottom of each wall at the vertex z and the top at z + elevation, and the top cap at z + elevation, so a slice spans exactly [z0, z1). Verified visually (stepped bands from 0 to 111 m on the sample, a 9 m step and the road plane's slope) and through picking (hovering a band reports its z range).
- A depth-only pass (the same slabs, fully transparent) is drawn before the tinted pass, so only the front-most faces are tinted (deck.gl's depth test is less-equal). Without it, overlapping translucent 1 m bands striped heavily. Crisp edges are a `PathLayer`: the ground and top outlines, rings at every step and every 5 m, and vertical lines at real corners (arc segments skipped).
- A selected design's floors are drawn first, then the envelope as a ghost (lower alpha), depth-tested against the floors. Switching off depth writes for the ghost instead (`parameters.depthWriteEnabled`) leaked GL state across MapLibre's interleaved passes and blanked the floors, so it is not used.
- The 3D camera looks from bearing 120°. From the old -20° a 177 m neighbour immediately south of the sample plot (OSM 4451674572) hid the envelope completely; that is the real site, so the camera moves rather than the building.

## 41. Choices made while break-testing

- **Number fields never drop input silently.** Road width (0.5–200 m), FAR bonus (0–20%) and station distance (0 m or more, empty = unknown) share `NumberField` and the rules in `lib/plot/number-input.ts`. Refused text stays in the field, marked invalid, with what is accepted and the value still in use; leaving the field puts that value back. A field shows the plot store, never the computed input, which lags while the engine runs.
- **Schedules add up as shown.** Floor areas in a schedule use largest-remainder rounding, so the whole-m² rows sum to the rounded total. The engine's numbers are unchanged; only display rounding moved.
- **One FAR limit per comparison.** Every design's FAR check uses the zone's FAR with the bonus (the MR 33 ceiling of 10 is above the largest bonus, 9.6), so the comparison names that limit once instead of per cell.
- **Roads per named street.** OSM ways with the same name and rounded width share one road when sides are marked from site data, so one street's frontage is counted once for the 12 m rule. Unnamed ways stay separate.
- **No site data is not an error.** `plot_too_large` from the API is shown like a plot outside the study area: a plain notice, no Retry.
- **Closing a drawn plot** needs a click within 16 px of the first corner, 28 px on touch screens (Terra Draw's default of 40 px closed narrow plots early). Enter still finishes.
- **The API's own errors use documented codes.** A body that is not JSON is `invalid_request`; a body not sent as `application/json` is 415 `unsupported_media_type` rather than a misleading "vertices: expected array".

## 42. Edited designs go through the same cut, measure and checklist as generated ones

`buildCustomDesign(input, spec, id)` analyses the site, stacks the spec's floors from 0 and cuts each plate with `cutPlate` (`designs/plates.ts`): the base (the envelope region valid for the floor's band, or the tower rectangle cut to it) shrunk by `insetM` (Clipper mitred offset of its largest piece, intersected with the original), then intersected with the floor below. The generators use the same function for every plate they make, including the trimmed top floor, which is now an even inset of the shape the floor was cut from (kept inside the floor below) rather than of the floor itself. Then `measureDesign` (`designs/measure.ts`) does the floor list, GFA, areas by use, keys, parking and `designChecks` for both, so a rule cannot drift between them.

- `spec.envelope: "highRise"` uses `highRiseGeometry` (the gate-off slices), as Design B does: a site failing the access test still gets floors, and `highRise.road` / `highRise.frontage` fail with the site's own messages. `"lowRise"` uses the low-rise slices and their 23 m ceiling; floors above it hold nothing (fit on) or are reported outside (fit off).
- `fitToEnvelope: false` replaces the region with the plot polygon (inset by `insetM`); the tower is cut to the plot. Every floor is still inside the plot and inside the floor below; `envelope.fit` measures the breach.
- A floor under 1 m² is kept (the user asked for it) with `areaM2: 0`, `outline: []`, and a second `envelope.fit` line fails, naming the floors in the 1-based numbering of the schedule ("Floors 23, 24 and 25 have no floor area…"). A new `RuleId` would have broken `Record<RuleId, …>` maps in the web app. All floors empty returns `{ ok: false, error: { code: "empty-design" } }`.
- The latest site analysis is remembered by the input's JSON, since the studio edits only the spec: a 40-floor tower spec on a 10-corner plot builds in about 1.2 ms (median, warm; the first call with a new plot adds the 4–8 ms site analysis). The test bound is 15 ms.

## 43. `Design.spec`, `straight`, and how exact the reproduction is

Every generated design carries `spec: DesignSpec` so "Customise" starts from exactly that building, and `Design` became generic (`Design<Id = DesignId>`, `CustomDesign = Design<CustomDesignId>`) so the web app's `DesignId` uses compile unchanged.

The mid-rise block (decision 27) cuts every floor to the region at the **block's** top, not each floor's own top, which `FloorSpec` alone could not express. `DesignSpec.straight` (approved contract change) says exactly that: floors are cut at the top of the highest floor that still fits, so the walls rise straight. A is `straight: true`; B and C are false.

Each generated floor records its recipe (plate source and inset), so B and C, and A in the usual case, rebuild bit-for-bit. When the optimiser drops whole floors from a straight block after planning it (parking-starved layouts, about 1 in 280 random plots), the actual top can sit in a lower, larger slice; `specOf` then finds each floor's inset again by area from that slice, so areas match within 0.5 m² but the outline can differ by a few centimetres. Tested on the sample and 50 random plots: same uses, heights and floor count, each floor within 0.5 m².

Generated designs now stop at 80 floors (`MAX_FLOORS`) and drop a partial top floor whose inset would exceed 40 m (`MAX_INSET_M`), so their spec is always valid. Neither happened on the 150-plot property test (tallest 46 floors).

## 44. Tower rectangle convention

`TowerSpec.widthM` runs along `rotationDeg`, measured **clockwise from east** (0 east, 90 south, −90 north), so the direction is (cos θ, −sin θ) in local x east, y north; `depthM` is across it. The centre is `offsetM` from the site anchor: the deepest point (centre of the deepest even inward offset) of the **low-rise ground slice**. It does not depend on the envelope the spec uses, so switching envelope does not move the tower; it moves when the plot, its roads or the setback toggles change. Generated B is built from its own spec (anchor + offset, angle), so the rectangle the studio draws is the one the design used. `defaultTowerSpec(input)` gives a tower for a design that has none: the type's target plate at 1.5 : 1 along the longest road, on the anchor.

## 45. Mixed uses: keys, parking and size caps per floor use

- Keys: condo units = residential floor area × 0.67 ÷ unit size; hotel rooms = hotel floor area ÷ m² per key. `unitSizeM2` sizes the building type's lodging use (condo units in a condo or office, rooms in a hotel); the other keeps its default (45 m², 70 m²). `keyCount` is the building type's own count (units for a condo, rooms for a hotel, null for an office).
- Parking (MR 7): required = max(large-building rate, Σ per-use counts). Cl. 4 says each use of a mixed building needs its own count "altogether", and cl. 3(1)(H) takes the larger of that and 1 per 120 m² of building area (outside parking, as before). New: shops (MR 7's "department", cl. 1(10): a building or part for showing and selling goods) need 1 per 20 m², fraction counted as 20 m², from 300 m² (cl. 2(5), 3(1)(E)). Amenity floors have no rate of their own; they count toward GFA and the 1 per 120 m². A mixed design cites "MR 7 cl. 3(1), 4".
- Size caps apply to the floors of each capped use, not only the building type: a condo with office floors gets the office operating-area check (`use.size`), hotel floors the room check (`use.rooms`), retail floors a retail check (`use.size`). Retail reads the plan's "การประกอบพาณิชยกรรม" (commerce) clauses: ย.8 cl. 15(11): over 5,000 m² needs a 16 m road, over 10,000 m² a 30 m road; ย.9 cl. 16(9) and ย.10 cl. 17(9): 12 m and 16 m; within 500 m of a station both are lifted. Read in the Royal Gazette text. Office and hotel citations stay at the clause level.
- EIA: lodging sizes apply when the design has residential or hotel floors (or is a condo/hotel), the other-building sizes when it has office or retail floors (or is an office). Generated designs read as before.

## 46. Studio helpers

`describeSpecChange(prev, next)` returns one sentence for the undo history ("Floor 8: Residential → Office", "Added floor 23 (Amenity)", "Envelope: high-rise → low-rise"); several edits read as the first two, or "…; and N more changes". Among identical neighbouring floors an insert or removal is reported at the last of them. `defaultFloorSpec(use, below?)` takes the floor below rather than the building type: a floor added on a tower continues the tower (plate and inset), and its height is the use's typical height (`USE_FLOOR_HEIGHT_M`; retail 4.5 m and amenity 4 m are new estimates in `DESIGN_ASSUMPTIONS`).

## 47. What the spec schema refuses

0 or more than 80 floors, a floor under 2.6 m (MR 55 cl. 22) or over 8 m, an inset over 40 m, a unit size outside 20–400 m², unknown keys, and "tower" floors with `tower: null`. `buildCustomDesign` trusts its types like the rest of the engine, but a tower floor without a tower holds no area rather than throwing.

## 48. Cost and return is a separate pure call, not part of the engine result

`feasibilityFor(design, input, values)` (`packages/engine/src/feasibility/`) prices one design. It is not embedded in `EngineSuccess` or `Design`: the money assumptions change independently of the plot (a user editing a sale price should not re-run the envelope), custom designs from `buildCustomDesign` need the same numbers without a second code path, and keeping `Design` unchanged avoids touching the worker, API and stored shapes. It reads only the floors (area by use), `footprintM2 + openSpaceM2` (the plot area), `spec.unitSizeM2` and the input's building type, and runs in about 8 µs (1,000 calls under 50 ms is tested), so the UI can call it per design on every edit.

## 49. How each use is valued

- **Costs** are construction per m² of GFA by floor use, plus soft costs (12%) and contingency (8%), both on construction. Land is not a cost line; it is what the result is compared with. No high-rise premium: the research found none for Bangkok, and the office rate (30,000–35,000, BOI/Tractus 2025) is already for high-rise towers.
- **Condo floors** are sold: residential area × 0.67 (the designs' `condoEfficiency`, so unit counts and sales agree) × the Sukhumvit launch average (242,130, C&W Q4 2025) less a 5% discount for slow absorption. The InterContinental Asoke (297,500) and STILL Sukhumvit 20 (410,000) are single, branded projects, so the submarket average is the default.
- **Office and retail floors** are held: lettable area × asking rent × 12 × occupancy, less 20% running costs (NOI; an estimate, since Bangkok quoted rents generally include service), ÷ a cap rate (office 6%: prime CBD is 5.6% per JLL; retail 7%, unsourced).
- **Hotel floors**: rooms (the designs' own count) × ADR (upscale 4,197) × occupancy (76.2%) × 365 × 35% NOI margin on room revenue ÷ 7%. Income capitalisation rather than a per-key value, because it responds to the user's ADR, occupancy and room count, and the two per-key data points disagree (7 m asking for a 120-key Sukhumvit 22 hotel, 18.5 m paid for the Hyatt Regency Sukhumvit). The defaults give about 5.8 m per key, which the sentence shows so the user can compare.
- **Lobby, amenity and parking** have no direct value. No sourced car park income was found, so it is zero rather than guessed.
- A design with sold and held uses is `kind: "mixed"`; GDV is the sum of sale values and capitalised values. Purchaser's costs on the investment value and the time to sell are not modelled.

## 50. Left for land takes the profit on the land too

Left for land L solves GDV = (costs + L) × (1 + margin), so L = GDV ÷ (1 + margin) − costs and the profit is margin × (costs + L). Taking the margin on building costs only would overstate what a developer can pay by margin × L, about ฿290 m for the sample condo tower. The verdict compares L with the market land cost, which is the same test as GDV ≥ (costs + land) × (1 + margin). The default margin, 20%, is Supalai's 16–19% net margin on sales expressed on cost.

## 51. Land price and the honest answer on the sample plot

Land cost = plot m² ÷ 4 (1 sq wah = 4 m²) × 2.80 m per sq wah (AREA's 2025 Sukhumvit–Asok average); the Treasury appraisal (750,000 per sq wah on Sukhumvit Road, 2023–26) is reported alongside as a lower, tax-only reference. At the defaults every sample design is short of the land price: the 10 m soi caps a high-rise at 30,000 m² and lobby plus parking take about a third of it, so a condo at the submarket average leaves about ฿1.45 bn for ฿2.44 bn of land. Covering the land takes a launch price of about 340,000 per m² (STILL Sukhumvit 20 launched at 410,000), which matches the luxury schemes Asok land is bought for. The model reports that rather than tuning defaults to make the land pay.

## 52. How the scene is drawn: clean massing, a quiet basemap, callouts and chips

- **Massing, not slabs.** A selected design is drawn by `lib/scene/massing.ts`, a pure function of `Design.floors` (cached per design object), so an edited design draws the same way. Per floor plate: an opaque façade band in the use colour (`USE_HEX` in `lib/results/designs.ts`, shared with the panel and map legends) and a 0.24 m floor line just proud of it; exposed roofs get a roof cap, a parapet and, on the top roof, a darker plant room and lift core; corners and roof lines get thin edge lines. Day views show no windows (clean first, as in a concept study). Night view adds one pane per bay (`bayCentres`, about 3–3.6 m), ~70% lit from a deterministic hash.
- **deck.gl features.** `SolidPolygonLayer` for bands, floor lines, roofs and ground; `PathLayer` for edges and the floor highlight; `SimpleMeshLayer` (`@deck.gl/mesh-layers`, new dependency) for every box: parapets, plant rooms, trees and window panes are instances of one unit box or canopy mesh (`components/map/meshes.ts`), so thousands of details cost one draw call and no polygon tessellation while dragging a corner. `LightingEffect` with an ambient light and one `DirectionalLight` whose direction comes from `lib/scene/sun.ts` (solar position for the plot, Bangkok time).
- **No deck.gl shadow maps.** `_shadow: true` in the interleaved overlay darkened whole façades and streaked the tower (the shadow pass does not fit MapLibre's camera). Instead `lib/scene/shadow.ts` draws a soft ground shadow: the convex hull of the footprint and each floor's top pushed away from the sun. It follows the sun slider; there is none at night or with the sun below 4°.
- **Lit windows.** `SimpleMeshLayer` always applies the lights (`material: false` does not switch them off), so the night window material has an ambient factor of 4.2 that cancels the dim night ambient; lit panes then show near their own colour.
- **Basemap.** `components/map/basemap-style.ts` runs after `style.load` and on theme or night changes: hides the shop/café/POI symbol layers, shields and one-way arrows, keeps `poi_transit` for rail stations only (BTS/MRT matter for the 500 m rule), keeps road and district names, and recolours every layer (warm light greys, or a dark set). A soft map light keeps the neighbours matte and white. No new hosts.
- **Hiding on-plot buildings, root cause.** OpenFreeMap building ids are not unique per building: one id can be a multipolygon of many separate blocks (on the sample plot id 155805610 covers dozens of 5 m shophouses), and a style filter hides whole features, so the id filter emptied the blocks around the plot. The hider still filters the on-plot ids, then merges each feature's tile pieces (Clipper union, so tile buffers count once), splits it into parts, and draws every part that does not overlap the plot (≥ 0.5 m²) again from a GeoJSON layer, `buildings-restored`, styled like `building-3d`. Outlines with `hide_3d` (buildings mapped in parts) are skipped. The on-plot parts feed the "As built" ghost (`as-built-3d`) and `useAsBuilt` (`lib/scene/as-built.ts`: footprint on the plot, render_height, an estimated floor area at 3.5 m a storey). On the sample plot that is 1,057 m² of a 50 m complex and 55 m² of a 5 m row. The 2D `building` layer (zoom 13–14 only) is not restored.
- **Callouts** are HTML labels positioned every frame from the overlay's deck viewport (`components/map/callouts.ts`; `MapLibreOverlay` has no public projection, so it reads `_deck`, guarded until it is initialised): height and storeys over the roof, the setback distance on the setback band. The setback is measured from the middle of each road side to the buildable ground, so it shows what the envelope does. Road widths stay on the side labels; `siteAnnotations` also returns road callouts for a layout without them.
- **View state.** `lib/results/view.ts` has `selectedFloor` (a floor's `level`, cleared with the design) and `setSelectedFloor`; hovering a floor outlines it, clicking selects it, clicking empty map clears it. `lib/scene/view.ts` holds the sun date and hour, night, and the map toggles (`setback`, `heightLimit`, `asBuilt`).
- **Measured:** dragging a sample-plot corner with Podium + tower shown, Playwright-driven Chrome on the development Mac (hardware not profiled): median frame 16.7 ms, p95 16.8 ms, 8 of 231 frames over 20 ms; orbiting the camera holds 16.7 ms.

## 53. The study is three steps around one map, and the steps never block

The owner's reference was a concept-study screen. The layout keeps its ideas: a top bar with the place and three steps (Brief, Site and rules, Options), a 420 px column for the step, the map always in view, and a comparison table under the map. The steps are navigation, not a wizard: every step can be opened at any time and nothing is lost by leaving one (all three stay mounted, hidden). The app opens on Options, since the sample plot already evaluates and the options are the answer; "Draw another plot" goes to Site and rules and starts drawing. The comparison strip shows only on the Options step so the map has its full height while the plot is drawn. On phones the map is on top (46 dvh), the step follows, and the comparison becomes cards.

## 54. Edited designs are variants of an option, built in the worker

"Customise" copies an option's `spec` into a variant (`custom-` + 12 random hex characters, badge = source letter + number: B1, B2). Variants are rebuilt by `buildCustomDesign` in the engine worker on every edit and every new evaluation of the plot, one latest-wins lane per variant so a drag on one never waits behind another. The worker validates input, spec and id at the boundary. When the envelope check fails with fitting off, the worker also finds which floors stick out: the area outside the envelope through floor k only grows with k (floors never depend on the floors above), so halving the floor range finds the levels where it grows with O(k log n) extra builds. The map is not told about variants: the studio mirrors the built designs into the view store the map already follows.

## 55. One drag is one undo step, and "what changed" compares whole steps

Undo history keeps the spec before each change. Edits carrying the same gesture key (a slider drag, a typing session in a number field) fold into one step that keeps the spec from before the gesture; a drag that ends where it started leaves no step. Labels come from `describeSpecChange`. "What changed" lists the checks whose status differs from the build of the spec before the last step (a cache of recent checklists per variant), not from the previous build, which may be halfway through the same drag. Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z (or Ctrl+Y) undo and redo the selected variant, except inside text fields, which keep their own undo.

## 56. Variants and money assumptions are kept in this browser, per plot

Variants are saved to `localStorage` (`envelope.studio.v1`) under a key made from the plot's corners (6 decimals). Reshaping the plot moves its variants to the new key; drawing a new plot or loading the sample loads that plot's own variants. At most 12 plots are kept, oldest dropped first. On load every stored variant is checked with zod and `designSpecSchema`; anything invalid is dropped, not repaired. History is not stored. Cost-and-return overrides (`envelope.feasibility.v1`) apply to every option and are validated per key with `feasibilityAssumptionsSchema`. Storage that throws (private mode, blocked) leaves everything working for the visit.

## 57. Section preview, recommended option and saleable area

The Shape tab draws the building as a section seen from its longest road side (or the longest side), both axes in metres at one scale: each floor is a band as wide as its outline reaches along that road, runs of one use are labelled ("18 × Residential · 19,045 m²", total area of the run, so the labels add up to the floor area), and the allowed envelope is dashed behind. The roof plant box is indicative and not counted. "Recommended" marks the passing option (generated or the user's) with the most floor area. "Saleable ≈" in the studio is residential floor area × `condoEfficiency` and is shown only for condos; offices and hotels show their main-use area instead, since there is no sourced lettable efficiency in the design assumptions.

## 58. A minimal layout of our own: the map and one inspector

The studio layout had followed a reference concept-study product too closely: the three steps across the top, option cards with a "Recommended" chip, Shape / Rules / Customise / Cost / Return tabs, a map chip row with "As built", a floor-use legend, 3D callouts ("69 m · 22 storeys", "6 m setback"), a permanent comparison table with an "As built, for comparison" row, and its wording ("Ways to build it", "Left for land", "Concept study"). All of it is replaced by our own layout and words. The map fills the screen. One inspector holds four sections (Plot, Rules, Schemes, Money). Schemes is a short list; the selected scheme shows its section, checks and floor schedule, and "Edit a copy" opens the editor in place. The comparison opens over the map only when asked. The map tools are icons plus one Layers menu (Allowed envelope, Setbacks, Existing building). The money words are the industry's own: "residual land value", "Pays for the land" / "฿X below the land price". The side labels on the plot stay, since they were ours from phase 2. Nothing the engine computes changed. Reference products are inspiration only. Their layout and wording are never copied.

## 59. A plot over existing buildings waits for the user to confirm their demolition

A plot drawn over buildings that stand there today used to be checked as if the site were empty, silently. It is now handled as a redevelopment site, which the user must confirm. Blocking such plots would also block the usual Asok case, where an old building is torn down. Which buildings count comes from the basemap's buildings (the same measurement that hides on-plot buildings, `building-hider.ts`), so it works anywhere, not only inside the PostGIS study area. A building counts when the plot covers at least 25 m² of it, or at least a quarter of a small one (5 m² or more). Smaller overlaps are slight misalignment between the map data and a line drawn along a neighbour's wall. While drawing, the counted buildings turn red and the drawing panel says how many and how much ground. After finishing, results wait (`siteHold`): first for the map's measurement of the new plot ("checking"), then for "Confirm demolition" or "Redraw on open land". The confirmation lasts until another plot is drawn; reshaping the confirmed plot does not ask again. The sample plot moved from Soi Sukhumvit 19, where the map shows a 50 m building covering about 1,060 m² of it, to open land on Asok Montri Road (17 m, about 4,060 m²). There a high-rise is allowed but capped at 30,000 m² (MR 33 cl. 2), so the cap is visible on the starting plot.

## 60. Deploying needs two variables; the URL comes from Vercel

`BETTER_AUTH_URL` was required and `NEXT_PUBLIC_APP_URL` was required but read nowhere. Every Vercel preview has its own URL, so a fixed origin breaks sign-in on previews. `resolveAuthUrl` (`packages/auth/src/url.ts`) takes an explicit `BETTER_AUTH_URL` first. Otherwise it uses `VERCEL_PROJECT_PRODUCTION_URL` in production, and the branch URL (or deployment URL) on previews. Locally it falls back to `http://localhost:3100`. Every Vercel hostname of the deployment is a trusted origin. The browser client already calls `/api/auth` on its own origin, so `NEXT_PUBLIC_APP_URL` is removed. The Vercel system variables are pass-through in Turbo (`globalPassThroughEnv`), so they reach the build without changing its cache key. Functions run in `sin1` (`apps/web/vercel.json`), next to the Neon database in Singapore. Without that, every query would cross the Pacific from the default `iad1`.

## 61. The camera finds a clear view, orbits 360°, and can see through neighbours

A fixed bearing (120°) was chosen for the old sample plot and often looked through a tower at other plots. Three things now keep the plot in view:

- **Clear view.** When a plot first appears, is drawn, is reset, or Reset view or 3D is pressed, `clearestView` (`lib/scene/clear-view.ts`, pure, tested) scores every bearing in 15° steps at pitches 55°, 45° and 35°. The input is the extruded basemap buildings within about 300 m (`components/map/neighbours.ts`). A building between the camera and the plot counts by how far it rises above the line of sight, times its width. The usual 55° and the current bearing win ties, and the camera turns only when another angle is clearly clearer. The angle is chosen once per plot (keyed by its first corner's id, which survives drags), so a user's own rotation is never undone by an edit. Neighbours load tile by tile, so the first plot gets its angle when the map first goes idle, unless the user has already moved the camera.
- **Turn and orbit.** Buttons at the bottom right turn the view 45° either way, and Orbit spins slowly around the plot (a full turn in about 40 s). Orbit stops on any pointer, wheel or key input, and when drawing starts. With reduced motion, orbit is off and the step buttons remain.
- **See-through neighbours.** An option in the Layers menu fades the surrounding buildings (`building-3d` and `buildings-restored`) to 22% opacity. They stay as context for the real site, and the setting survives a theme switch.

## 62. No time-of-day picker

The sun picker (date, hour slider, presets) was removed: it added a control and a popover, and the figures don't depend on it. Daylight is a fixed Bangkok afternoon (`DAYLIGHT_HOUR` 15:00, today's date) with the sun's real position, so shadows still read the massing. Night view stays, as one button.
