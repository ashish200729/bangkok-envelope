import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@envelope/db";
import * as schema from "@envelope/db/schema";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { env } from "./env";
import { resolveAuthUrl } from "./url";

const { baseURL, trustedOrigins } = resolveAuthUrl(env);

export const auth = betterAuth({
  appName: "Bangkok Plot Envelope",
  baseURL,
  trustedOrigins,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  plugins: [anonymous()],
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  // Defence in depth behind the API's own limiter (packages/api/src/app.ts). Memory storage is per
  // serverless instance; see docs/decisions.md.
  rateLimit: {
    enabled: true,
    storage: "memory",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/anonymous": { window: 600, max: 10 },
    },
  },
  telemetry: { enabled: false },
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
