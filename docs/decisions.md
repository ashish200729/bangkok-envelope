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
