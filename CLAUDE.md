# Bangkok Plot Envelope

pnpm 12 + Turborepo monorepo. Node 24. Read README.md for layout and scripts, docs/decisions.md for why.

- Dev server: `pnpm dev` on **port 3100** (3000 belongs to other projects). Never kill a process you did not start.
- Env lives only in `apps/web/.env.local`; package scripts load it with `dotenv -e ../../apps/web/.env.local`. Each package validates its own env (`src/env.ts`). CI builds with `SKIP_ENV_VALIDATION=1`.
- Internal packages export TypeScript source (no build step); `apps/web/next.config.ts` lists them in `transpilePackages`.
- Add shared dependencies through the `catalog:` in `pnpm-workspace.yaml`.
- shadcn components: run `pnpm dlx shadcn@4.23.0 add <name>` from `apps/web`; files land in `packages/ui`.
- Changing Better Auth plugins: `pnpm auth:schema`, then `pnpm db:generate` and `pnpm db:migrate`.
- `packages/api` takes its dependencies through `createApp(deps)`; unit tests pass fakes, no database needed.
- `packages/engine` must stay free of framework and I/O imports.
- Before finishing: `pnpm check && pnpm typecheck && pnpm test && pnpm build`; `pnpm e2e` when UI or auth changed.
