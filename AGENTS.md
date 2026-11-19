# AGENTS.md

Shared context for every agent working in this repository. Read it fully before you change anything. `README.md` covers setup and scripts; `docs/decisions.md` records why each choice was made. When you make a decision that a later agent would need to know, add it to `docs/decisions.md`.

## 1. What we are building

A browser tool for a real estate developer in Bangkok. Before paying an architect, they want to know what they can build on their plot: how big, how tall, and what it might look like.

The user:

1. Draws the plot on a real map (any shape, rarely a rectangle).
2. Picks the zone, the road the plot faces (and its width), and a building type (for example, a condo).
3. Sees, instantly:
   - The rules that apply (floor area ratio, open space, setbacks, height), each with its legal source.
   - The 3D space the building is allowed to fill (the **envelope**).
   - At least two concept designs inside it, each with a pass/fail checklist.
   - All of it in 3D among the real neighbouring buildings and roads.

Scope is **one zone family, done properly: ย.8–ย.10 (high-density residential, brown on the Bangkok zoning map)**, likely along the Sukhumvit / Asok / Phaya Thai rail corridor.

This is a 48-hour hiring assignment for General Machines / Silicon Bricks. **Deadline: 2026-11-21 02:40 UTC.** Reviewers will judge:

| Criterion      | What they test                                                                          |
| -------------- | --------------------------------------------------------------------------------------- |
| Any plot shape | Plot is drawn on a map; concave and irregular shapes work                               |
| Accurate       | The envelope follows the real outline, each rule visibly changes it, floor areas add up |
| Real site      | Plot sits in 3D among actual buildings and roads, not an empty grid                     |
| Live           | Changing plot, road or building type updates everything with no reload                  |
| Finished       | Smooth on a normal laptop, looks client-ready. "We will try to break it."               |

Hard constraints:

- The live tool must work **without signing in** (reviewers will not create accounts; the submission server rejects links behind a sign-in). Guest sessions exist for this.
- **Agents never write the submission write-up** (the one-pager, setup answers, about-me). The human writes those. Agents may write code, docs in `docs/`, and README content.

Product plan (living document): https://claude.ai/artifact/Hf8YFrC5gPmiCVw88uELvk

## 2. Domain rules (the source of truth for the engine)

Three layers of law apply at once; **the strictest rule wins**. Every number the engine uses must carry its citation so the UI can show it.

Sources (all read from the official texts):

- **Bangkok Comprehensive Plan 2013** (กฎกระทรวงให้ใช้บังคับผังเมืองรวมกรุงเทพมหานคร พ.ศ. 2556), Royal Gazette vol. 130 part 41 ก, 16 May 2013. Still in force; a 4th-revision draft is expected to take effect around 2027. Use 2013.
- **Ministerial Regulation 33** (กฎกระทรวง ฉบับที่ 33, 2535), high-rise and extra-large buildings, as amended by MR 50.
- **BMA Building Control Ordinance 2544** (ข้อบัญญัติกรุงเทพมหานคร เรื่อง ควบคุมอาคาร พ.ศ. 2544).
- **Ministerial Regulation 7** (parking).

Definitions (2013 plan, clause 4):

- **FAR** = total floor area of all floors of all buildings ÷ plot area.
- **OSR** = uncovered open ground on the plot ÷ **total floor area** (not ÷ plot). At least half of the open space must be permeable for planting.

| Rule                       | Value                                                                                                            | Source                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| FAR max ย.8 / ย.9 / ย.10   | 6 / 7 / 8                                                                                                        | 2013 plan cl. 15 / 16 / 17                                                                                    |
| OSR min ย.8 / ย.9 / ย.10   | 5% / 4.5% / 4%                                                                                                   | same clauses                                                                                                  |
| Condo size cap in ย.8–ย.10 | none                                                                                                             | cl. 15–17 list none for อาคารอยู่อาศัยรวม                                                                        |
| FAR bonus, combined cap    | +20%                                                                                                             | cl. 51–57 (affordable housing, public park, park-and-ride near stations, rainwater retention, green building) |
| Height vs road             | height at any point ≤ 2 × horizontal distance to the far side of the nearest public road                         | BMA ord. cl. 49                                                                                               |
| Road setback, road < 10 m  | ≥ 6 m from road centreline                                                                                       | BMA ord. cl. 50                                                                                               |
| Road setback, road 10–20 m | ≥ road width / 10, from property line                                                                            | BMA ord. cl. 50                                                                                               |
| Road setback, road > 20 m  | ≥ 2 m from property line                                                                                         | BMA ord. cl. 50                                                                                               |
| Openings toward neighbours | ≥ 2 m (≤ 9 m height), ≥ 3 m (> 9 m)                                                                              | BMA ord. cl. 54                                                                                               |
| High-rise threshold        | height ≥ 23 m (ground to roof deck)                                                                              | MR 33 cl. 1                                                                                                   |
| High-rise site access      | frontage ≥ 12 m on a public road ≥ 10 m wide; ≥ 18 m road if total floor area > 30,000 m²                        | MR 33 cl. 2                                                                                                   |
| High-rise clearance        | every part, basements included, ≥ 6 m from neighbouring plots and public road; 6 m fire lane around the building | MR 33 cl. 3–4                                                                                                 |
| High-rise FAR ceiling      | ≤ 10                                                                                                             | MR 33 cl. 5                                                                                                   |
| Open space, residential    | ≥ 30% of plot area                                                                                               | MR 33 cl. 6; BMA ord. cl. 52                                                                                  |
| Large building             | > 2,000 m² total, or ≥ 15 m tall and > 1,000 m²                                                                  | MR 7                                                                                                          |
| Extra-large building       | ≥ 10,000 m²                                                                                                      | MR 33 cl. 1                                                                                                   |
| Parking, Bangkok           | condo: 1 per unit > 60 m²; large building: 1 per 120 m²; take the larger                                         | MR 7 cl. 3                                                                                                    |

Useful consequences:

- At max FAR the plan's OSR equals ~30% open ground (6 × 5% = 30%, 7 × 4.5% = 31.5%, 8 × 4% = 32%), so the footprint can cover at most ~70% of the plot.
- Parking floor area counts toward FAR under the 2013 definition (only _extra public_ parking near stations is exempt, cl. 54). Designs must reserve parking floors.
- Crossing 23 m switches on the high-rise rules. A plot on a soi narrower than 10 m cannot hold a high-rise. This is the key trade-off between designs.

Open interpretation calls (record your choice in `docs/decisions.md` if you touch them):

- Corner plots: each point uses the road nearest to it for the height rule.
- The user enters the legal road width (เขตทาง, property line to property line); OSM only suggests it.
- Out of scope, and the UI must say so: EIA thresholds, waterway setbacks, aviation height limits, the 4th-revision draft.

## 3. Architecture

```
Browser                                   Next.js server (Vercel)
 map + draw ─► store ─► engine (worker) ─► 3D layers + panels
                  │                        /api/* ─► Hono app (packages/api)
                  └──── fetch ────────────►   ├─ db  (Neon Postgres + PostGIS)
                                              └─ auth (Better Auth, guests)
```

- The **engine runs in the browser** for live updates and on the server to verify saved results and build reports. Same code in both.
- The **backend** is a Hono app in `packages/api`, mounted in Next at `apps/web/src/app/api/[[...route]]/route.ts`. The frontend calls it through the typed client in `apps/web/src/lib/api.ts` (`hc<AppType>`).

### Packages

| Path                | Role                                           | Rules                                                                                                                                          |
| ------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`          | Next.js 16 App Router app, pages, map, panels  | Client components for the map; no business rules here                                                                                          |
| `packages/engine`   | Rules, geometry, envelope, designs, checklist  | **Pure TypeScript. No React, Next, DOM, fetch, fs or database imports.** Deterministic. Heavily tested                                         |
| `packages/api`      | Hono routes                                    | Dependencies enter through `createApp(deps)`; tests pass fakes. Validate input with zod. Error shape `{ error: { code, message, requestId } }` |
| `packages/db`       | Drizzle schema, `pg` Pool, migrations, queries | Schema changes only via `pnpm db:generate`; never hand-edit applied migrations                                                                 |
| `packages/auth`     | Better Auth server config and browser client   | Anonymous plugin on; tool must work signed out                                                                                                 |
| `packages/ui`       | shadcn/ui components and the "Blueprint" theme | Add components with the shadcn CLI (see §5); use theme tokens, not literal colours                                                             |
| `packages/tsconfig` | Shared TS presets                              |                                                                                                                                                |

Internal packages export TypeScript source directly (no build step). `apps/web/next.config.ts` lists them in `transpilePackages`; add a new package there.

### Engine contract (built, `packages/engine`)

The shared types every workstream builds against. Change them only with care: they cross the Web Worker, the API and the database. Everything is plain JSON (no classes, Maps or Dates).

| File          | Contents                                                                                                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `geo.ts`      | `LngLat` (GeoJSON order, lng first), `LinearRing` (closed), `Polygon` (outer CCW + holes), `MultiPolygon`, `closeRing`                                                                                                              |
| `inputs.ts`   | Zod schemas and inferred types: `EngineInput`, `Plot`, `PlotEdge`, `Road`, `Site`, `RuleToggles`, `ZoneCode` (`Y8`/`Y9`/`Y10`, Thai labels in `ZONES`), `BuildingType` (`condo`/`office`/`hotel`, `BUILDING_TYPE_INFO.residential`) |
| `law.ts`      | `LawId`, `LAWS` registry (titles, links), `Citation`, `formatCitation`                                                                                                                                                              |
| `rules.ts`    | `RuleId`, `RULE_INFO` (label + unit for every rule; the compiler enforces completeness), `Unit`                                                                                                                                     |
| `outputs.ts`  | `EngineResult` = `EngineSuccess` (`rules`, `envelope`, `designs`) or `EngineFailure` (`error.code`), `Envelope`/`EnvelopeSlice`, `Design`/`Floor`, `Check`, `AppliedRule`, `Evaluate`                                               |
| `fixtures.ts` | `SAMPLE_INPUT`: an illustrative plot near Asok; the app's starting plot and the base for tests                                                                                                                                      |
| `version.ts`  | `ENGINE_VERSION`, stamped on every result                                                                                                                                                                                           |

Rules of the contract:

- **Plot is an open ring.** `edges[i]` describes the side from `vertices[i]` to `vertices[i + 1]` (the last edge closes to vertex 0); `edges.length === vertices.length`. Winding may be either; the engine normalises it. Outputs use closed GeoJSON rings.
- **Edge identity lives in the UI.** Terra Draw has no stable vertex ids, so the UI store keeps its own ids and rebuilds `edges` on every change; the engine only sees indices.
- **Validate at boundaries** with `engineInputSchema.safeParse` (worker messages, API bodies, saved projects, URL state). Inside the engine, trust the types.
- **Units:** metres, square metres, ratios as fractions (OSR 4% is `0.04`), FAR bonus in percent (0–20). Round only for display.
- **Road width is the legal right-of-way** (เขตทาง). For a road edge, the road's property line is the plot edge; its centreline is `widthM / 2` outward and its far side `widthM` outward.
- **Errors are values, not exceptions.** Geometry the engine cannot use returns `{ ok: false, error: { code } }`.

### Planned engine algorithm (not built yet)

1. Project the plot to local metres (equirectangular around the plot; error < 0.01% at plot scale).
2. Label each plot edge as road-facing (with its road width) or neighbour boundary.
3. Rules as data: a zone table plus law constants, each value with `source`.
4. Envelope as height slices: for each height z (1 m steps), allowed region(z) = plot − ⋃ buffer(edge, setback(z)) − ⋃ buffer(far side of road, z/2); empty above 23 m when the site fails the high-rise test. Use Clipper2 (`clipper2-ts`) for offsets and booleans.
5. Designs: A = mid-rise under 23 m; B = podium + tower using full FAR; C (optional) = stepped massing. Each carries a floor schedule; GFA = sum of floor areas.
6. Checklist per design: value vs limit vs citation, pass / fail / warn.

Required tests: hand-checked rectangle (40 × 50 m on a 12 m road), concave and narrow plots, and property tests over random plots (every floor ⊂ its slice ⊂ plot; GFA ≤ FAR × area; open space + footprint = plot area).

### Site data backend (built, phase 6)

Real buildings, roads and stations for a fixed study area around Asok (`STUDY_AREA`, lon 100.547–100.575, lat 13.728–13.752), from a committed OpenStreetMap snapshot. **No runtime calls to Overpass/OSM.** Decisions 18–20 explain the choices.

| Path                              | Role                                                                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/schema/site.ts`  | `site_buildings` (MultiPolygon, `height_m`, `base_m`, `height_source`), `site_roads` (MultiLineString, `class`, `width_m`, `width_source`), `site_stations` (Point), `site_snapshots` (source, dates, counts). GiST indexes. Migration `0002_site_data` |
| `packages/db/src/site.ts`         | DB-free barrel, import as `@envelope/db/site`: `STUDY_AREA`, bbox helpers, normalisers, snapshot format, result types                                                                                                                                   |
| `packages/db/src/site-queries.ts` | `getSiteBuildings`, `getPlotContext` (nearest station, road per side, buildings on plot), `getSnapshotInfo`. Parameterised `sql` only                                                                                                                   |
| `packages/db/seed/`               | `asok-osm.json` snapshot (ODbL), `fetch-osm.ts` (`pnpm db:seed:fetch`, Overpass, rarely needed), `load-site.ts` (`pnpm db:seed`, idempotent upsert)                                                                                                     |
| `packages/api/src/routes/site.ts` | `GET /api/site/area`, `GET /api/site/buildings?bbox=`, `POST /api/site/plot-context`; rate limit (`site-rate-limit.ts`) and 32 KB body limit                                                                                                            |

- Road widths from OSM are suggestions (`widthSource` `osm-tag` / `osm-estimate`, same values as the engine's `Road.widthSource`); the user's value wins.
- `pnpm --filter @envelope/db test:db` runs the SQL integration tests against `DATABASE_URL` (skipped in plain `pnpm test`).
- Error codes: `invalid_request`, `outside_study_area`, `bbox_too_large`, `plot_too_large`, `payload_too_large` (413), `rate_limited` (429, `Retry-After`).

### Planned backend routes (not built yet)

`GET /api/zone?lat=&lng=`, `POST/GET /api/projects`, `GET /p/[shareId]`, `GET /api/projects/:id/report`.

### Map (built, phase 2)

The home page `/` is the tool: map on the left (top on phones), panel on the right. `/status` is the stack status page.

| Path                                             | Role                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/plot/draft.ts`                 | `PlotDraft`: vertices with stable `VertexId`s and side roles keyed by the side's starting vertex. `reconcileVertices` maps Terra Draw's coordinate lists onto it (drag keeps ids; insert splits a side and both halves keep its role; delete merges and keeps a road) |
| `apps/web/src/lib/plot/store.ts`                 | Zustand store: draft, roads, settings (zone, building type, station distance, bonus, toggles), map mode (`edit`/`draw`), hovered/selected side, `geometryRevision` (bump to push geometry into the map)                                                               |
| `apps/web/src/lib/plot/engine-input.ts`          | `toEngineInput(draft, roads, settings)`: builds and validates the `EngineInput` with `engineInputSchema`                                                                                                                                                              |
| `apps/web/src/lib/plot/geometry.ts`, `format.ts` | Side lengths, geodesic area, self-intersection; m² and Thai rai/ngan/wah formatting                                                                                                                                                                                   |
| `apps/web/src/components/map/plot-map.tsx`       | Creates the MapLibre map once (client only, loaded with `next/dynamic` via `plot-map-loader.tsx`), wires the controller, layers and store, fit and 2D/3D buttons, WebGL 2 fallback message                                                                            |
| `apps/web/src/components/map/draw-controller.ts` | Owns Terra Draw: polygon mode (validated on finish only: not self-crossing, ≥ 50 m²), select mode (drag corners, drag midpoints to insert, right-click to delete, never self-crossing)                                                                                |
| `apps/web/src/components/map/side-layers.ts`     | Road sides and labels as **native MapLibre layers** (flat lines), hover and click linked to the panel                                                                                                                                                                 |
| `apps/web/src/components/map/building-hider.ts`  | Hides basemap buildings that intersect the plot by filtering `building` / `building-3d` on feature ids; re-runs as tiles load                                                                                                                                         |
| `apps/web/src/components/panel/plot-panel.tsx`   | Plot size, sides list (role per side, new road), road widths, zone, building type, station distance, readiness status                                                                                                                                                 |

Rules learned the hard way:

- MapLibre's CSS forces `position: relative` on the map container. Give the container `h-full w-full` inside a sized parent; never `absolute inset-0` on it.
- Call `setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString())` before creating the map. Turbopack emits the worker as a hashed asset.
- Terra Draw 1.39's `change` events carry no `origin`. The controller mutes its own changes with a flag while loading a plot.
- Validate Terra Draw polygons on `finish` only. Validating on `commit` rejects every click, because an unfinished polygon contains repeated points.
- Terra Draw wants mutable coordinate arrays; the engine's are readonly. Convert with `.map(([lng, lat]) => [lng, lat])`.
- MapLibre and Terra Draw cannot parse OKLCH; map colours live as hex in `components/map/colors.ts`.
- Development builds expose `window.__envelopeMap` (MapLibre map) and `window.__envelopeDraw` (controller, with `debug()`) for Playwright. They are not set in production.
- deck.gl (`MapLibreOverlay` from `@deck.gl/maplibre`, interleaved) is installed and proven in a spike; it is reserved for the 3D envelope and designs (phase 4). Do not use `react-map-gl` or `@deck.gl/mapbox`.

## 4. Environment and services

- Node 24, pnpm 12.15 (`packageManager` field). Dev server: **`pnpm dev` on port 3100**. Port 3000 belongs to other local projects. **Never kill a process you did not start.**
- Env lives only in `apps/web/.env.local` (git-ignored; template in `.env.example`). Package scripts load it with `dotenv -e ../../apps/web/.env.local`. Each package validates its own env in `src/env.ts`. `SKIP_ENV_VALIDATION=1` skips validation (CI uses it).
- Database: Neon project `bangkok-envelope`, region aws-ap-southeast-1 (Singapore), Postgres 18, PostGIS 3.6. Connect with the pooled URL and `sslmode=verify-full`. The owner's other Neon projects are unrelated; never touch them.
- Never print, log or commit secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`). The repo is **public**.
- Never point tests or scripts at the database destructively. If you need a throwaway database, create a Neon branch, not a reset.

## 5. Conventions

- **Dependencies:** add the version to the `catalog:` in `pnpm-workspace.yaml`, then reference it as `"catalog:"`. Pin exact versions. Prefer releases at least two weeks old unless a security fix says otherwise.
- **UI components:** `cd apps/web && pnpm dlx shadcn@4.23.0 add <name>`. Files land in `packages/ui/src/components`. Import as `@envelope/ui/components/<name>`.
- **Theme:** use tokens (`bg-primary`, `text-muted-foreground`, `text-pass`, `text-fail`, `text-warn`, `bg-envelope`, `bg-zone-residential-high` …) from `packages/ui/src/styles/globals.css`. Fonts: IBM Plex Sans + IBM Plex Sans Thai, IBM Plex Mono for figures (`font-mono tabular`). Both light and dark must look right.
- **Auth schema:** after changing Better Auth plugins run `pnpm auth:schema`, then `pnpm db:generate` and `pnpm db:migrate`.
- **Code style:** Biome (2 spaces, double quotes, 100 columns). Strict TypeScript with `noUncheckedIndexedAccess`. Model state as discriminated unions, not boolean flags. Parse external data at the boundary (zod); trust internal types after that.
- **Comments:** only for a non-obvious _why_. No narration.
- **Tests:** assert behaviour users can observe. Engine tests use real geometry, not mocks.
- **Copy:** plain, specific words. Errors say what went wrong and how to fix it. Every rule shown to the user names its legal source.

## 6. Working in parallel

Several agents may work at once. To avoid collisions:

1. **One task, one branch, one worktree.** Never work directly on `main`. From the main checkout:

   ```bash
   git worktree add ../bangkok-envelope-<task> -b <type>/<task>   # feat, fix, chore, docs
   cd ../bangkok-envelope-<task>
   pnpm install
   cp ../bangkok-envelope/apps/web/.env.local apps/web/.env.local   # then change the port URLs, see 4.
   ```
2. **Own your files.** Each workstream below owns its paths. Edit files outside them only when the task needs it, and say so in your report.
3. **Shared files are serialized.** `pnpm-workspace.yaml`, `pnpm-lock.yaml`, root `package.json`, `turbo.json`, `biome.json`, `apps/web/next.config.ts`, `packages/ui/src/styles/globals.css`, and `packages/db/migrations/**` cause merge conflicts. Keep edits to them minimal and mention them in the report. Only one agent at a time generates a migration.
4. **Ports:** the main checkout uses 3100. A second dev server in a worktree uses `pnpm --filter @envelope/web exec next dev --port 31xx` with a matching `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` in that worktree's own `.env.local`.
5. **Contracts first.** If two workstreams meet (for example engine output consumed by the 3D layers), agree the TypeScript types in `packages/engine` before building both sides.
6. **Small commits** that each pass the gate. Commit message: imperative subject, a body explaining why, and the `Co-Authored-By` line your runtime asks for.
7. **Do not push, merge, deploy or create PRs unless the human asked.** Report what you did instead.

### Workstreams

| Workstream                        | Owns                                                                             | Depends on          |
| --------------------------------- | -------------------------------------------------------------------------------- | ------------------- |
| Engine: rules, geometry, envelope | `packages/engine/**`                                                             | none                |
| Engine: designs and checklist     | `packages/engine/src/designs*`, `checks*`                                        | envelope types      |
| Map and 3D                        | `apps/web/src/components/map/**`, `apps/web/src/lib/plot/**`                     | engine output types |
| Inputs and results UI             | `apps/web/src/components/panel/**`, `apps/web/src/app/page.tsx`                  | engine types, store |
| Site data backend                 | `packages/api/src/routes/site*`, `packages/db/src/schema/site*`, `scripts/seed*` | one migration       |
| Projects, sharing, PDF            | `packages/api/src/routes/projects*`, `packages/db/src/schema/projects*`          | engine, auth        |
| Deploy                            | `vercel.json`, CI                                                                | everything green    |

## 7. Definition of done

Run before reporting a task finished:

```bash
pnpm check && pnpm typecheck && pnpm test && pnpm build
pnpm e2e        # when UI, API routes or auth changed (needs the database)
```

Then:

- Exercise the change on the real surface (browser for UI, `curl` for API), in light and dark mode and at phone width for UI.
- Report: what changed and why, files touched (flag shared files), how you verified it, and anything unverified. Label guesses as guesses.

## 8. Current status

- Done: monorepo starter (Next.js 16, Hono API, Neon + PostGIS, Drizzle migrations, Better Auth guests, Blueprint theme, Biome, Vitest, Playwright, CI). The home page is a temporary system status page.
- Done: engine contract (phase 1): input schemas, result types, law registry, rule ids, sample input, 20 tests.
- Done: map (phase 2): 3D map of the real site, draw and edit any plot shape, side roles and road widths, zone and building type inputs, on-plot buildings hidden, live engine input. 16 web unit tests, 7 map e2e tests.
- Done: site data backend (phase 6): OSM snapshot of Asok in PostGIS (5,766 buildings, 1,691 roads, 7 stations), `/api/site/*` routes. Not yet consumed by the web app.
- Next: engine core (phase 3), then connect it to the map (phase 4: envelope in 3D with deck.gl), designs and checklist, wire site data into the map and panel, polish, deploy to Vercel.
