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

| Rule                       | Value                                                                                                                                                                 | Source                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| FAR max ย.8 / ย.9 / ย.10   | 6 / 7 / 8                                                                                                                                                             | 2013 plan cl. 15 / 16 / 17                                                                                    |
| OSR min ย.8 / ย.9 / ย.10   | 5% / 4.5% / 4%                                                                                                                                                        | same clauses                                                                                                  |
| Condo size cap in ย.8–ย.10 | none                                                                                                                                                                  | cl. 15–17 list none for อาคารอยู่อาศัยรวม                                                                        |
| FAR bonus, combined cap    | +20%                                                                                                                                                                  | cl. 51–57 (affordable housing, public park, park-and-ride near stations, rainwater retention, green building) |
| Height vs road             | height at any point ≤ 2 × horizontal distance to the far side of the nearest public road                                                                              | BMA ord. cl. 49                                                                                               |
| Road setback, road < 10 m  | ≥ 6 m from road centreline                                                                                                                                            | BMA ord. cl. 50                                                                                               |
| Road setback, road 10–20 m | ≥ road width / 10, from property line                                                                                                                                 | BMA ord. cl. 50                                                                                               |
| Road setback, road > 20 m  | ≥ 2 m from property line                                                                                                                                              | BMA ord. cl. 50                                                                                               |
| Openings toward neighbours | ≥ 2 m (≤ 9 m height), ≥ 3 m (> 9 m)                                                                                                                                   | BMA ord. cl. 54                                                                                               |
| High-rise threshold        | height ≥ 23 m (ground to roof deck)                                                                                                                                   | MR 33 cl. 1                                                                                                   |
| High-rise site access      | frontage ≥ 12 m on a public road ≥ 10 m wide; ≥ 18 m road if total floor area > 30,000 m²                                                                             | MR 33 cl. 2                                                                                                   |
| High-rise clearance        | every part, basements included, ≥ 6 m from neighbouring plots and public road; 6 m fire lane around the building                                                      | MR 33 cl. 3–4                                                                                                 |
| High-rise FAR ceiling      | ≤ 10                                                                                                                                                                  | MR 33 cl. 5                                                                                                   |
| Open space, residential    | ≥ 30% of plot area                                                                                                                                                    | MR 33 cl. 6; BMA ord. cl. 52                                                                                  |
| Large building             | > 2,000 m² total, or ≥ 15 m tall and > 1,000 m²                                                                                                                       | MR 7                                                                                                          |
| Extra-large building       | ≥ 10,000 m²                                                                                                                                                           | MR 33 cl. 1                                                                                                   |
| Parking, Bangkok           | condo: 1 per unit > 60 m²; office ≥ 300 m²: 1 per 60 m²; shop ≥ 300 m²: 1 per 20 m²; hotel by rooms; mixed uses add up; large building: 1 per 120 m²; take the larger | MR 7 cl. 2, 3(1), 4                                                                                           |
| Retail size cap            | commerce over 5,000 m² needs a 16 m road (ย.8) / 12 m (ย.9–10), over 10,000 m² 30 m / 16 m; a station within 500 m lifts both                                         | 2013 plan cl. 15(11), 16(9), 17(9)                                                                            |

Useful consequences:

- At max FAR the plan's OSR equals ~30% open ground (6 × 5% = 30%, 7 × 4.5% = 31.5%, 8 × 4% = 32%), so the footprint can cover at most ~70% of the plot.
- Parking floor area counts toward FAR under the 2013 definition (only _extra public_ parking near stations is exempt, cl. 54). Designs must reserve parking floors.
- Crossing 23 m switches on the high-rise rules. A plot on a soi narrower than 10 m cannot hold a high-rise. This is the key trade-off between designs.

Open interpretation calls (record your choice in `docs/decisions.md` if you touch them):

- Corner plots: each point uses the road nearest to it for the height rule.
- The user enters the legal road width (เขตทาง, property line to property line); OSM only suggests it.
- Out of scope, and the UI must say so: waterway setbacks, aviation height limits, the 4th-revision draft. EIA is shown only as an informational "warn" line per design (a process step, not a refusal; screening sizes in `EIA_RULES`).

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

| File          | Contents                                                                                                                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `geo.ts`      | `LngLat` (GeoJSON order, lng first), `LinearRing` (closed), `Polygon` (outer CCW + holes), `MultiPolygon`, `closeRing`                                                                                                                                                                               |
| `inputs.ts`   | Zod schemas and inferred types: `EngineInput`, `Plot`, `PlotEdge`, `Road`, `Site`, `RuleToggles`, `ZoneCode` (`Y8`/`Y9`/`Y10`, Thai labels in `ZONES`), `BuildingType` (`condo`/`office`/`hotel`, `BUILDING_TYPE_INFO.residential`)                                                                  |
| `law.ts`      | `LawId` (incl. `eia`, the MNRE EIA notification), `LAWS` registry (titles, links), `Citation`, `formatCitation`                                                                                                                                                                                      |
| `rules.ts`    | `RuleId`, `RULE_INFO` (label + unit for every rule; the compiler enforces completeness), `Unit`                                                                                                                                                                                                      |
| `outputs.ts`  | `EngineResult` = `EngineSuccess` (`rules`, `envelopes: { lowRise, highRise }`, `highRise: HighRiseAccess`, `designs`) or `EngineFailure` (`error.code`), `Envelope`/`EnvelopeSlice`, `Design`/`Floor`, `Check`, `AppliedRule`, `Evaluate`; `CustomDesign`, `CustomDesignResult`, `BuildCustomDesign` |
| `spec.ts`     | Zod schemas for an editable design: `DesignSpec` (`name`, `envelope`, `fitToEnvelope`, `straight`, `floors: FloorSpec[]` 1–80, `tower: TowerSpec \| null`, `unitSizeM2`), `FloorSpec` (`use`, `heightM` 2.6–8, `plate: "envelope" \| "tower"`, `insetM` 0–40), `TowerSpec`                           |
| `fixtures.ts` | `SAMPLE_INPUT`: open land on Asok Montri Road (17 m), no mapped building; the app's starting plot and the base for tests                                                                                                                                                                             |
| `version.ts`  | `ENGINE_VERSION`, stamped on every result                                                                                                                                                                                                                                                            |

The result, in short (plain JSON):

```ts
type EngineSuccess = {
  ok: true;
  version: string;
  plotAreaM2: number;
  rules: AppliedRule[]; // display order; per-road rules (setback.road, height.roadPlane) repeat once per road
  envelopes: {
    lowRise: Envelope; // 0 to 23 m (exclusive): road setback, 2 m / 3 m to neighbours, road height plane
    highRise: Envelope | null; // 0 up: 6 m clearance on every side (or the road setback if larger), road plane
  };
  highRise: { allowed: boolean; checks: Check[]; maxGfaM2: number | null }; // null envelope ⇔ !allowed
  designs: Design[]; // A "midrise", B "podium-tower", C "stepped", in that order; see below
};
type Envelope = { slices: EnvelopeSlice[]; maxHeightM: number; groundAreaM2: number };
type EnvelopeSlice = { z0M: number; z1M: number; footprint: MultiPolygon; areaM2: number }; // valid for z0 ≤ z < z1
// AppliedRule: { id, label, value, unit, source, affectsEnvelope, enabled, note? }
type Design<Id = DesignId> = {
  id: Id; // DesignId = "midrise" | "podium-tower" | "stepped"; CustomDesign = Design<`custom-${string}`>
  name: string;
  summary: string; // one plain sentence
  spec: DesignSpec; // the recipe; buildCustomDesign(input, spec, id) rebuilds these floors (± 0.5 m² each)
  envelope: "lowRise" | "highRise"; // the envelope it was fitted to and checked against
  floors: Floor[]; // bottom to top; Floor = { level, z0M, heightM, use, outline: Polygon (lng/lat, closed), areaM2 }
  // use: lobby | parking | retail | amenity | residential | office | hotel; an empty floor has areaM2 0 and outline []
  heightM: number; // top of the last floor
  gfaM2: number; // exactly Σ floors[].areaM2
  farUsed: number;
  footprintM2: number; // ground floor area
  openSpaceM2: number; // plot − footprint
  osrUsed: number; // openSpace ÷ GFA
  useAreaM2: number; // main-use floors only (plan's "operating area")
  keyCount: number | null; // condo units from residential floors or hotel rooms from hotel floors, by building type; null for offices
  parking: { requiredSpaces: number; providedSpaces: number };
  checks: Check[]; // Check = { ruleId, label, status: pass|fail|warn|n/a, actual, limit, unit, source, message }
  passes: boolean; // no check failed
};
```

A floor's outline is the largest connected piece of its plate. A floor never extends past the floor below.

Edited designs (the design studio, decisions 42–47):

```ts
buildCustomDesign(input: EngineInput, spec: DesignSpec, id: `custom-${string}`): CustomDesignResult;
// { ok: true, design: CustomDesign } | { ok: false, error: { code: EngineErrorCode | "empty-design", message } }
```

- Validate a spec at the boundary with `designSpecSchema.safeParse` (a "tower" floor needs `tower`).
- Floors stack bottom-up from 0. Plate = the region of `spec.envelope` valid for the floor's band (at its top; with `straight`, at the top of the highest floor that fits), or the tower rectangle cut to it, shrunk by `insetM`, then cut to the floor below. `lowRise` uses the 23 m low-rise slices; `highRise` the high-rise geometry as if the access gate were off (so an 8 m road still gets floors and fails `highRise.road`).
- `fitToEnvelope: false` cuts to the plot instead, so `envelope.fit` reports the breach and everything else is still measured.
- A floor left with under 1 m² stays in the list with `areaM2: 0` and a second, failing `envelope.fit` check names it. All floors empty → `empty-design`.
- Tower: `widthM` runs along `rotationDeg` clockwise from east (0 east, 90 south), centred `offsetM` (x east, y north) from the deepest point of the low-rise ground slice.
- `unitSizeM2` sizes condo units (condo, office) or hotel rooms (hotel); the other lodging use keeps its default.
- Measuring and checking are one path (`designs/measure.ts`) for generated and edited designs. Studio helpers: `defaultFloorSpec(use, below?)`, `defaultTowerSpec(input)`, `describeSpecChange(prev, next)`, `USE_LABEL`.

Cost and return (built, `feasibility/`, decisions 48–51). A separate pure call per design, not part of `EngineSuccess`, so generated and edited designs are priced the same way:

```ts
feasibilityFor(design: Design | CustomDesign, input: EngineInput, values?: FeasibilityValues): Feasibility;
// costs { construction { totalTHB, byUse }, softCostsTHB, contingencyTHB, totalTHB (no land) },
// value { kind: sale | investment | mixed, grossDevelopmentValueTHB, incomePerYearTHB | null, byUse },
// marginTHB, leftForLandTHB, landCostTHB, landTreasuryCostTHB, landVerdict, landGapTHB, perM2, lines
```

- `FEASIBILITY_ASSUMPTIONS`: every money and ratio number with `{ value, unit, source, confidence, note }` (THB; ratios as fractions). Condo saleable efficiency is `DESIGN_ASSUMPTIONS.condoEfficiency`, not a copy.
- User edits: validate with `feasibilityAssumptionsSchema.safeParse` (partial values only, bounded), then `resolveAssumptions(overrides)` → `FeasibilityValues`. `FEASIBILITY_KEYS` lists the keys; each `lines[i].keys` names the assumptions a sentence used.
- Condo floors are sold; office, retail and hotel floors are valued on net income ÷ a cap rate; lobby, amenity and parking floors cost but earn nothing. Left for land = GDV ÷ (1 + margin) − costs (profit on all costs incl. land). Land = plot m² ÷ 4 (sq wah) × price.
- Display with `formatTHB` ("฿2.48 bn", "฿330 m", "฿12,500"), `formatTHBPerM2`, `formatTHBPerSqWah`. Every figure is rough; the UI must show each assumption's confidence and source.

Engine core (built, phase 3). `evaluate` lives in `evaluate.ts`; the pieces a design generator needs are exported too:

| File               | Contents                                                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projection.ts`    | `makeProjection(origin)` → `toLocal` / `toLngLat` (equirectangular, WGS84 metres per degree), `ringCentroid`. Local `XY` is metres, x east, y north                                     |
| `plot.ts`          | `preparePlot`: project around the centroid, drop zero-length sides, validate (errors as values), make the ring CCW. `LocalEdge` keeps the input edge index                              |
| `rules-data.ts`    | Every number with its citation: `ZONE_RULES`, `LAW`, `USE_SIZE_RULES`; `roadSetbackM`, `boundaryDistanceM`, `roadPlaneDistanceM`, `farLimit`, `sizeCapForUse`, `openSpaceMin`           |
| `setbacks.ts`      | `edgeDistances(edges, "lowRise" \| "highRise", z, toggles)`: how far each side's cut reaches at height z (data: a list of distance rules per envelope)                                  |
| `region.ts`        | `allowedRegion`: plot minus a stadium (true segment distance) per side, via Clipper2 at 0.1 mm; `Region` holds local polygons, area and Clipper paths                                   |
| `envelope.ts`      | `regionAt(plot, kind, z, toggles)`, `buildSlices` (1 m bands, merged when equal, stop under 1 m²), `toEnvelope`                                                                         |
| `high-rise.ts`     | `roadFrontages`, `assessHighRise` (MR 33 cl. 2 access, 30,000 m² cap, fits after clearance)                                                                                             |
| `applied-rules.ts` | `appliedRules`: the rules panel list                                                                                                                                                    |
| `evaluate.ts`      | `analyseSite` (local-metre analysis for designs: plot, frontages, slices, high-rise access, `highRiseGeometry` = high-rise slices as if the gate were off, region cache) and `evaluate` |
| `format.ts`        | `formatNumber` (cached `Intl.NumberFormat`; `toLocaleString` per call was a measurable cost)                                                                                            |

Designs (built, phase 5), in `designs/`:

| File             | Contents                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assumptions.ts` | `DESIGN_ASSUMPTIONS`: every non-law number (floor heights, 27 m² per parking space, 45 m² units at 0.67, 70 m² per hotel key, tower plates…) with source and confidence; `keyCount`                                 |
| `parking.ts`     | `PARKING_RULES` (MR 7 cl. 3(1) rates, retail 1 per 20 m²), `spacesByUse` (uses added up, cl. 4), `requiredSpacesFor(mix)` (the larger of that and 1 per 120 m²), `requiredSpaces` / `spacesForUse` for one main use |
| `plates.ts`      | Clipper plate helpers: largest piece, intersect, `insetToArea` (even inward offset, binary search), `deepestPoint`, rectangles, `toPolygon`                                                                         |
| `stack.ts`       | `Program` (ground use + whole parking floors), `PlateCache` (plates per slice, memoised), `steppedStack` (each floor = its top slice ∩ the floor below)                                                             |
| `mid-rise.ts`    | Scheme A: straight block under 23 m, one outline (low-rise region at the block's top, capped to the open-ground footprint)                                                                                          |
| `tower.ts`       | Scheme B: podium (lobby + parking) filling the high-rise region, tower rectangle chosen by `towerBase`                                                                                                              |
| `stepped.ts`     | Scheme C: every floor as large as its own band allows                                                                                                                                                               |
| `program.ts`     | `Limits`, `bestLayout` (tries footprints and parking-floor counts, solves use area + parking within the caps, trims the top floor)                                                                                  |
| `checks.ts`      | `designChecks` (FAR, high-rise FAR ceiling, OSR, open ground, envelope fit measured by Clipper, empty floors, height or high-rise access, use size per capped use present, parking, EIA), `EIA_RULES`               |
| `measure.ts`     | `measureDesign`: the one measuring path (floors, areas by use, keys, parking, checklist) for generated and edited designs                                                                                           |
| `recipe.ts`      | `specOf`: a generated design's `DesignSpec` from the cuts it was built with                                                                                                                                         |
| `custom.ts`      | `buildCustomDesign`, `customDesign`, `cutFloors` (the spec's floors cut bottom-up); remembers the latest site analysis                                                                                              |
| `studio.ts`      | `defaultFloorSpec`, `defaultTowerSpec`, `describeSpecChange`, `USE_LABEL`                                                                                                                                           |
| `index.ts`       | `limitsFor`, `buildDesigns`                                                                                                                                                                                         |

Rules of the contract:

- **Plot is an open ring.** `edges[i]` describes the side from `vertices[i]` to `vertices[i + 1]` (the last edge closes to vertex 0); `edges.length === vertices.length`. Winding may be either; the engine normalises it. Outputs use closed GeoJSON rings.
- **Edge identity lives in the UI.** Terra Draw has no stable vertex ids, so the UI store keeps its own ids and rebuilds `edges` on every change; the engine only sees indices.
- **Validate at boundaries** with `engineInputSchema.safeParse` (worker messages, API bodies, saved projects, URL state). Inside the engine, trust the types.
- **Units:** metres, square metres, ratios as fractions (OSR 4% is `0.04`), FAR bonus in percent (0–20). Round only for display.
- **Road width is the legal right-of-way** (เขตทาง). For a road edge, the road's property line is the plot edge; its centreline is `widthM / 2` outward and its far side `widthM` outward.
- **Errors are values, not exceptions.** Geometry the engine cannot use returns `{ ok: false, error: { code } }`.

### Engine algorithm

Steps 1–4 are built (phase 3); 5–6 in phase 5 (decisions 27–33).

1. Project the plot to local metres (equirectangular around the plot centroid; error < 0.01% at plot scale).
2. Label each plot edge as road-facing (with its road width) or neighbour boundary.
3. Rules as data: a zone table plus law constants, each value with `source`.
4. Two envelopes as height slices. For each 1 m band [z0, z1), region = plot − ⋃ stadium(side i, d_i(z1)), where d_i is the largest distance that applies to that side at z1 (road setback, neighbour distance, high-rise clearance, and for road sides the height plane z/2 − width). Cuts only grow with height, so each band starts from the band below. A band uses its top height because that is its strictest point. See `docs/decisions.md` §18–§21.
5. Designs: A = straight mid-rise block inside `lowRise`, below 23 m; B = podium + tower inside the high-rise geometry (built even when the site fails the access test, so its checklist shows why; dropped when it cannot reach 23 m); C = stepped massing in whichever allowed envelope holds more (dropped when it repeats A and B exists). Each carries a floor schedule; GFA = sum of floor areas. Caps: `farLimit(zone, bonus, highRise)`, 30,000 m² for a high-rise without an 18 m road (gate on), OSR (open ground ÷ GFA), the open-ground footprint (30% / 10%, when `openSpace` is on), `sizeCapForUse` (hotel rooms × 70 m²). Parking (whole floors, counted in GFA) must meet MR 7.
6. Checklist per design: value vs limit vs citation, pass / fail / warn / n/a. Open space and OSR are design checks, not envelope cuts; a switched-off toggle makes its checks "n/a" ("Switched off"). Envelope fit is measured (Clipper difference against every slice a floor spans), not assumed. EIA is a "warn".

Required tests: hand-checked rectangle (40 × 50 m on a 12 m road), concave and narrow plots, and property tests over random plots (every floor ⊂ its slice ⊂ plot; GFA ≤ FAR × area; open space + footprint = plot area). Designs: `designs/designs.test.ts` checks these per design over 150 random plots (types, zones, bonuses, toggles), plus Σ floors = GFA, every cap, no overhangs, and the timing.

### Site data backend (built, phase 6)

Real buildings, roads and stations for a fixed study area around Asok (`STUDY_AREA`, lon 100.547–100.575, lat 13.728–13.752), from a committed OpenStreetMap snapshot. **No runtime calls to Overpass/OSM.** Decisions 18–20 explain the choices.

| Path                              | Role                                                                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/schema/site.ts`  | `site_buildings` (MultiPolygon, `height_m`, `base_m`, `height_source`), `site_roads` (MultiLineString, `class`, `width_m`, `width_source`), `site_stations` (Point), `site_snapshots` (source, dates, counts). GiST indexes. Migration `0002_site_data` |
| `packages/db/src/site.ts`         | DB-free barrel, import as `@envelope/db/site`: `STUDY_AREA`, bbox helpers, normalisers, snapshot format, result types                                                                                                                                   |
| `packages/db/src/site-queries.ts` | `getPlotContext` (nearest station, road per side), `getSnapshotInfo`. Parameterised `sql` only, each call in one transaction under a 3 s `statement_timeout` (`statement-timeout.ts`)                                                                   |
| `packages/db/seed/`               | `asok-osm.json` snapshot (ODbL), `fetch-osm.ts` (`pnpm db:seed:fetch`, Overpass, rarely needed), `load-site.ts` (`pnpm db:seed`, idempotent upsert)                                                                                                     |
| `packages/api/src/routes/site.ts` | `GET /api/site/area`, `POST /api/site/plot-context` (plot bounding box at most 0.25 km²); 32 KB body limit                                                                                                                                              |

- Road widths from OSM are suggestions (`widthSource` `osm-tag` / `osm-estimate`, same values as the engine's `Road.widthSource`); the user's value wins.
- `site_buildings` is loaded but has no API route yet (the map draws buildings from the basemap's vector tiles). Add one only with a bounded query, a statement timeout and a test.
- `pnpm --filter @envelope/db test:db` runs the SQL integration tests against `DATABASE_URL` (skipped in plain `pnpm test`).
- Error codes: `invalid_request` (also a body that is not JSON), `plot_too_large`, `unsupported_media_type` (415, body not sent as `application/json`), `payload_too_large` (413), `rate_limited` (429, `Retry-After`), `not_found`, `internal`.

### API routes and security (decisions 34–38)

| Route                         | Notes                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET /api/health`             | Production: `{ status, database: { ok } }` only. Elsewhere also versions, timings and the driver error. `no-store` |
| `GET /api/me`                 | Session summary                                                                                                    |
| `GET, POST /api/auth/*`       | Better Auth                                                                                                        |
| `GET /api/site/area`          | Study area, attribution, snapshot info; cached only once the snapshot exists, else `no-store`                      |
| `POST /api/site/plot-context` | Nearest station and road per side                                                                                  |

- The Next route (`app/api/[[...route]]/route.ts`) exports only `GET` and `POST`; other methods get 405 from Next.
- `createApp(deps)` rate-limits **every** `/api/*` request (120 a minute per client IP) and `POST /api/auth/sign-in/anonymous` again (10 per 10 minutes) before Better Auth runs; Better Auth's own limiter has the same anonymous rule. Both are in-memory, per serverless instance (decision 36). Limits are injectable (`rateLimits`) for tests.
- `exposeDetails` (from `NODE_ENV` in `packages/api/src/index.ts`) is the one switch for detail in responses; handlers do not read `process.env`.
- Every request-path query runs through `withStatementTimeout` (`@envelope/db`); a new query must too.
- `apps/web/next.config.ts` sets CSP and security headers on every route. A new external host (tiles, fonts, analytics) must be added to the CSP, or the browser blocks it. `/status` is a dev-only page (404 in production).

### Planned backend routes (not built yet)

`GET /api/zone?lat=&lng=`, `POST/GET /api/projects`, `GET /p/[shareId]`, `GET /api/projects/:id/report`.

### Map (built, phase 2)

The home page `/` is the tool (`components/layout/app-shell.tsx`): a slim header (name, plot summary, New plot, theme), the map filling the screen, and one 400 px inspector on the right (below the map on phones) with four sections: Plot, Rules, Schemes, Money (`useResultsView().section`). The scheme comparison opens over the map from Schemes. `/status` is the stack status page. Decision 58: keep it minimal and original, and never copy a reference product's layout or wording.

| Path                                             | Role                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/plot/draft.ts`                 | `PlotDraft`: vertices with stable `VertexId`s and side roles keyed by the side's starting vertex. `reconcileVertices` maps Terra Draw's coordinate lists onto it (drag keeps ids; insert splits a side and both halves keep its role; delete merges and keeps a road)                                                  |
| `apps/web/src/lib/plot/store.ts`                 | Zustand store: draft, roads, settings (zone, building type, station distance, bonus, toggles), map mode (`edit`/`draw`), hovered/selected side, `geometryRevision` (bump to push geometry into the map)                                                                                                                |
| `apps/web/src/lib/plot/engine-input.ts`          | `toEngineInput(draft, roads, settings)`: builds and validates the `EngineInput` with `engineInputSchema`                                                                                                                                                                                                               |
| `apps/web/src/lib/plot/geometry.ts`, `format.ts` | Side lengths, perimeter, bearing, interior angles (reflex > 180°), geodesic area, self-intersection; m, m², degrees and Thai rai/ngan/wah formatting                                                                                                                                                                   |
| `apps/web/src/components/map/plot-map.tsx`       | Creates the MapLibre map once (client only, loaded with `next/dynamic` via `plot-map-loader.tsx`), wires the controller, layers and store, fit and 2D/3D buttons, WebGL 2 fallback message                                                                                                                             |
| `apps/web/src/components/map/draw-controller.ts` | Owns Terra Draw: polygon mode (validated on finish only: not self-crossing, ≥ 50 m²), select mode (drag corners, drag midpoints to insert, right-click to delete, never self-crossing)                                                                                                                                 |
| `apps/web/src/components/map/side-layers.ts`     | Road sides and side labels ("3 · 42.3 m", road name, width and length) as **native MapLibre layers**, hover and click linked to the panel; the dragged corner's two sides highlighted                                                                                                                                  |
| `apps/web/src/components/map/measure-layers.ts`  | Live measurements while drawing (side lengths, pointer side with bearing, dashed closing side, corner angles, sharp < 15° in red) and the dragged corner's angle; label pills drawn with `icon-text-fit`                                                                                                               |
| `apps/web/src/components/map/draw-hud.tsx`       | HUD while drawing: corners, perimeter, area (m² and Thai units), hints; screen readers hear it only when a corner is placed or removed                                                                                                                                                                                 |
| `apps/web/src/components/map/building-hider.ts`  | Hides basemap buildings that intersect the plot (id filter, then redraws the off-plot parts of those ids as `buildings-restored`); on-plot parts feed `useAsBuilt`; the red `buildings-clash` layer shows buildings under the outline while drawing and covered buildings awaiting confirmation; re-runs as tiles load |
| `apps/web/src/lib/plot/clearance.ts`             | Existing buildings on the plot (decision 59): which count (≥ 25 m² covered, or ≥ 25% of a small one), `siteHold` (results wait while a new drawing is checked, then until demolition is confirmed); `useSiteHold` gates `useScene` and the map                                                                         |
| `apps/web/src/components/map/basemap-style.ts`   | Restyles Liberty at runtime: POI icons hidden, rail stations kept, light or dark palette (decision 52)                                                                                                                                                                                                                 |
| `apps/web/src/lib/scene/**`                      | Pure scene generators: `massing.ts` (bands, floor lines, roof plant, night panes), `landscape.ts` (ground, trees), `annotations.ts` (setback bands, callouts), `sun.ts`, `shadow.ts`, `view.ts` (sun, night, map toggles), `as-built.ts`                                                                               |
| `apps/web/src/components/panel/plot-panel.tsx`   | Plot size, sides list (role per side, new road), road widths, zone, building type, station distance, readiness status                                                                                                                                                                                                  |

Rules learned the hard way:

- MapLibre's CSS forces `position: relative` on the map container. Give the container `h-full w-full` inside a sized parent; never `absolute inset-0` on it.
- Call `setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString())` before creating the map. Turbopack emits the worker as a hashed asset.
- Terra Draw 1.39's `change` events carry no `origin`. The controller mutes its own changes with a flag while loading a plot.
- While drawing, Terra Draw's polygon is `[placed…, pointer, first]`; `properties.committedCoordinateCount` is the number placed, and the pointer is real only when `provisionalCoordinateCount` exceeds it. Backspace uses `draw.undo()`, which needs `undoRedo: { modeLevel: new TerraDrawModeUndoRedo() }`.
- Terra Draw adds its `td-*` layers when it starts, above ours. Labels are moved above them with `moveLayer` afterwards. MapLibre places symbols top layer first, so the layer order is also the label priority (always-shown active labels on top).
- Validate Terra Draw polygons on `finish` only. Validating on `commit` rejects every click, because an unfinished polygon contains repeated points.
- Terra Draw wants mutable coordinate arrays; the engine's are readonly. Convert with `.map(([lng, lat]) => [lng, lat])`.
- MapLibre and Terra Draw cannot parse OKLCH; map colours live as hex in `components/map/colors.ts`.
- Development builds expose `window.__envelopeMap` (MapLibre map) and `window.__envelopeDraw` (controller, with `debug()`) for Playwright. They are not set in production.
- deck.gl (`MapLibreOverlay` from `@deck.gl/maplibre`, interleaved) draws the envelope and designs (`components/map/envelope-layers.ts`, decisions 40 and 52). Do not use `react-map-gl` or `@deck.gl/mapbox`. Never set `parameters.depthWriteEnabled` on a layer: it leaks GL state across MapLibre's passes. deck.gl shadow maps do not work interleaved (decision 52). Development builds expose `window.__envelopeDeck` (`layers()`, `view()` with sun, night, toggles, selected floor and callouts, `pick(x, y)`), `__sceneView`, `__resultsView` and `__asBuilt` (zustand stores).
- OpenFreeMap building ids are not unique per building; never filter basemap buildings by id alone (decision 52).
- The engine runs in a Web Worker behind a latest-wins scheduler (`lib/engine/*`); components read `useEngineResult()` (`idle | computing(previous) | ready | invalid`). Zod is configured jitless before any app code (`src/instrumentation-client.ts`, decision 39) so the CSP sees no eval.
- Inspector sections: Plot (`components/panel/**`, building type included), Rules (`components/results/rules-tab.tsx`), Schemes (`components/results/schemes.tsx`: one row per scheme, then the selected scheme's section, checks and floor schedule, or its editor when `useResultsView().editing`), Money (`components/results/money.tsx`: Value and Cost). The comparison is `components/results/compare.tsx`; map layers (envelope, setbacks, existing building) are one menu in `components/map/map-chips.tsx`. No map legend or 3D callouts. Helpers in `lib/results/**`.
- Design studio (decisions 53–57): `lib/studio/**` (variants, undo history with gesture folding, floor-stack edits, section geometry, persistence, CSV, cost-and-return assumptions) and `components/studio/**`. Variants are `CustomDesignId`s built in the engine worker (`build-custom` request, one latest-wins lane per variant, `lib/engine/custom-builds.ts`); `startStudio()` (`lib/studio/sync.ts`) rebuilds them on every edit and every new evaluation and mirrors the built designs into `useResultsView().customDesigns`, which `sceneFor` searches, so the map draws a selected variant without knowing about the studio. `AnyDesign` (`lib/results/view.ts`) is the type for "generated or edited"; take it instead of `Design` anywhere a selected design can arrive.
- The camera fits the plot and the height of what stands on it (`fitToPlot` in `plot-map.tsx`, measured on screen), on load, Reset view, Fit and when another design is selected.

## 4. Environment and services

- Node 24, pnpm 12.15 (`packageManager` field). Dev server: **`pnpm dev` on port 3100**. Port 3000 belongs to other local projects. **Never kill a process you did not start.**
- Required env is only `DATABASE_URL` and `BETTER_AUTH_SECRET`. The auth origin is resolved by `packages/auth/src/url.ts` (explicit `BETTER_AUTH_URL`, else Vercel's production domain or branch URL, else `http://localhost:3100`); no `NEXT_PUBLIC_*` variable exists. Vercel: Root Directory `apps/web`, functions in `sin1` (`apps/web/vercel.json`), see README "Deploy to Vercel" (decision 60).
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
4. **Ports:** the main checkout uses 3100. A second dev server in a worktree uses `pnpm --filter @envelope/web exec next dev --port 31xx` with a matching `BETTER_AUTH_URL` in that worktree's own `.env.local`.
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
- Done: backend hardening after a security review: `/api/site/buildings` and `buildingsOnPlot` removed, statement timeouts, API-wide rate limits, production health summary, security headers and CSP (decisions 34–38).
- Done: engine designs and checklists (phase 5, engine side): three concept designs per plot with floor schedules and checklists; `evaluate` stays under ~20 ms on a 10-corner plot.
- Done: editable designs, engine side: `Design.spec`, `buildCustomDesign` (same cut, measure and checks as the generated designs), retail and amenity floors, mixed-use parking and size caps, studio helpers (decisions 42–47).
- Done: the design studio (decisions 53–57) and the minimal map-plus-inspector layout (decision 58).
- Done: deployed to Vercel (decision 64), live at https://bangkok-envelope-taupe.vercel.app. Pushes to `main` deploy to production.
