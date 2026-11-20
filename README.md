# Bangkok Plot Envelope

A web tool that shows what can be built on a plot in Bangkok: the zoning and building rules that apply, the 3D space a building may fill, and concept designs with pass/fail checks, placed among the real surrounding buildings.

**Live:** https://bangkok-envelope-taupe.vercel.app (no sign-in needed). Pushes to `main` deploy to production.

## Stack

| Layer    | Choice                                                                   |
| -------- | ------------------------------------------------------------------------ |
| Web      | Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4, shadcn/ui  |
| API      | Hono, mounted inside Next.js at `/api/*`, typed client via `hono/client` |
| Database | Neon Postgres 18 + PostGIS, Drizzle ORM                                  |
| Auth     | Better Auth with guest (anonymous) sessions                              |
| Tooling  | pnpm workspaces, Turborepo, Biome, Vitest, Playwright, GitHub Actions    |

## Layout

```
apps/web            Next.js app: pages, layout, the /api route that mounts the Hono app
packages/api        Hono app: routes, error handling. Dependencies are injected for tests
packages/auth       Better Auth server config and browser client
packages/db         Drizzle schema, Postgres client, migrations, health query
packages/engine     Zoning rules engine (pure TypeScript, runs in browser and server)
packages/ui         shadcn/ui components and the "Blueprint" theme
packages/tsconfig   Shared TypeScript presets
docs/               Decisions and prototypes
```

## Getting started

Requirements: Node 24, pnpm 12, a Neon project with PostGIS available.

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill in DATABASE_URL and BETTER_AUTH_SECRET
pnpm db:migrate                        # enables PostGIS, creates auth and site tables
pnpm db:seed                           # loads the committed OpenStreetMap snapshot of Asok
pnpm dev                               # http://localhost:3100
```

## Deploy to Vercel

1. Import the GitHub repository in Vercel and set **Root Directory** to `apps/web`. Vercel detects Next.js and the pnpm workspace; no build settings are needed.
2. In **Settings → Environment Variables**, add the two required variables for Production and Preview:
   - `DATABASE_URL`: the Neon pooled connection string (`sslmode=verify-full`).
   - `BETTER_AUTH_SECRET`: 32+ random characters, a different one per environment.
3. Deploy. Nothing else is needed:
   - **App URL:** no URL variable. Auth uses the production domain in production and the branch URL on previews, from Vercel's system variables (`packages/auth/src/url.ts`). Set `BETTER_AUTH_URL` only for a custom domain.
   - **Region:** functions run in Singapore (`sin1`, `apps/web/vercel.json`), next to the Neon database in `aws-ap-southeast-1`.
   - **Database:** run `pnpm db:migrate` and `pnpm db:seed` once against the production database, from your machine, before the first deploy.

## Scripts

| Command                         | What it does                                                    |
| ------------------------------- | --------------------------------------------------------------- |
| `pnpm dev`                      | Start the app on port 3100                                      |
| `pnpm build`                    | Production build of every package                               |
| `pnpm check` / `pnpm check:fix` | Biome lint and format                                           |
| `pnpm typecheck`                | TypeScript across the workspace                                 |
| `pnpm test`                     | Unit tests (Vitest)                                             |
| `pnpm e2e`                      | Browser smoke tests (Playwright, needs a database)              |
| `pnpm db:generate`              | Create a migration from schema changes                          |
| `pnpm db:migrate`               | Apply migrations to `DATABASE_URL`                              |
| `pnpm db:seed`                  | Load `packages/db/seed/asok-osm.json` into PostGIS (idempotent) |
| `pnpm db:seed:fetch`            | Re-fetch the snapshot from Overpass (only to refresh the data)  |
| `pnpm db:studio`                | Browse the database                                             |
| `pnpm auth:schema`              | Regenerate the Better Auth tables after changing auth plugins   |

## API

| Route                         | Description                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /api/health`             | API and database status (versions only outside production). 503 when the database is unreachable     |
| `GET /api/me`                 | Current session as the server sees it                                                                |
| `/api/auth/*`                 | Better Auth endpoints                                                                                |
| `GET /api/site/area`          | Study area polygon, OSM attribution, snapshot date and row counts                                    |
| `POST /api/site/plot-context` | `{ vertices: [lng, lat][] }` → nearest station and the road each side faces (with a suggested width) |

Site data is © OpenStreetMap contributors, available under the [Open Database License](https://www.openstreetmap.org/copyright). The app never calls OpenStreetMap at runtime; it serves a snapshot committed in `packages/db/seed/`.

See [docs/decisions.md](docs/decisions.md) for why each choice was made.
