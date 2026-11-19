import { defineConfig } from "drizzle-kit";
import { env } from "./src/env";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  casing: "snake_case",
  dbCredentials: { url: env.DATABASE_URL },
  extensionsFilters: ["postgis"],
  strict: true,
  verbose: true,
});
