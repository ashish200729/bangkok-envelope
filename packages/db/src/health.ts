import { sql } from "drizzle-orm";
import type { Database } from "./client";

export type DatabaseHealth = {
  postgres: string;
  postgis: string | null;
  latencyMs: number;
};

export async function checkDatabase(db: Database): Promise<DatabaseHealth> {
  const started = performance.now();
  const result = await db.execute<{ postgres: string; postgis: string | null }>(sql`
    select
      current_setting('server_version') as postgres,
      (select extversion from pg_extension where extname = 'postgis') as postgis
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Database returned no rows for the health query");
  return {
    postgres: row.postgres,
    postgis: row.postgis,
    latencyMs: Math.round(performance.now() - started),
  };
}
