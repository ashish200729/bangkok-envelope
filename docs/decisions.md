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
