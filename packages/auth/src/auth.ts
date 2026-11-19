import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@envelope/db";
import * as schema from "@envelope/db/schema";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { env } from "./env";

export const auth = betterAuth({
  appName: "Bangkok Plot Envelope",
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  plugins: [anonymous()],
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  telemetry: { enabled: false },
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
