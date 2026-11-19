import { sql } from "drizzle-orm";
import type { Database } from "./client";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Longest any request-path query may run before Postgres cancels it (SQLSTATE 57014). */
export const STATEMENT_TIMEOUT_MS = 3000;

/**
 * Runs `fn` in a transaction whose statements Postgres cancels after `timeoutMs`. `SET LOCAL`
 * lasts only until the transaction ends, so it works through Neon's pooler (PgBouncer in
 * transaction mode), which ignores startup options and would leak a plain `SET` to other clients.
 */
export function withStatementTimeout<T>(
  db: Database,
  fn: (tx: Transaction) => Promise<T>,
  timeoutMs: number = STATEMENT_TIMEOUT_MS,
): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError(`timeoutMs must be a positive integer, got ${timeoutMs}`);
  }
  return db.transaction(async (tx) => {
    // SET takes no bind parameters; the value is a checked integer.
    await tx.execute(sql.raw(`set local statement_timeout = '${timeoutMs}ms'`));
    return fn(tx);
  });
}
