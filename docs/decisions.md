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
