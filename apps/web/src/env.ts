import { env as authEnv } from "@envelope/auth/env";
import { env as dbEnv } from "@envelope/db/env";
import { createEnv } from "@t3-oss/env-nextjs";

/**
 * Server variables, checked at build and start. Only DATABASE_URL and BETTER_AUTH_SECRET are
 * required; the app's URL comes from Vercel's system variables (packages/auth/src/url.ts). The
 * browser needs none: it calls the API on its own origin.
 */
export const env = createEnv({
  extends: [dbEnv, authEnv],
  client: {},
  experimental__runtimeEnv: {},
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
});
