# Bangkok Plot Envelope

A web tool that shows what can be built on a plot in Bangkok: the zoning and building rules that apply, the 3D space a building may fill, and concept designs with pass/fail checks, placed among the real surrounding buildings.

Status: **starter template.** The home page is a temporary system status page that proves each layer works.

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
pnpm db:migrate                        # enables PostGIS, creates auth tables
pnpm dev                               # http://localhost:3100
```

## Scripts

| Command                         | What it does                                                  |
| ------------------------------- | ------------------------------------------------------------- |
| `pnpm dev`                      | Start the app on port 3100                                    |
| `pnpm build`                    | Production build of every package                             |
| `pnpm check` / `pnpm check:fix` | Biome lint and format                                         |
| `pnpm typecheck`                | TypeScript across the workspace                               |
| `pnpm test`                     | Unit tests (Vitest)                                           |
| `pnpm e2e`                      | Browser smoke tests (Playwright, needs a database)            |
| `pnpm db:generate`              | Create a migration from schema changes                        |
| `pnpm db:migrate`               | Apply migrations to `DATABASE_URL`                            |
| `pnpm db:studio`                | Browse the database                                           |
| `pnpm auth:schema`              | Regenerate the Better Auth tables after changing auth plugins |

## API

| Route             | Description                                                            |
| ----------------- | ---------------------------------------------------------------------- |
| `GET /api/health` | API, database and PostGIS status. 503 when the database is unreachable |
| `GET /api/me`     | Current session as the server sees it                                  |
| `/api/auth/*`     | Better Auth endpoints                                                  |

See [docs/decisions.md](docs/decisions.md) for why each choice was made.
