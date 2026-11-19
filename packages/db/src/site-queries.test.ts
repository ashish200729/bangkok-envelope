import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "./client";
import type * as Queries from "./site-queries";
import type * as Timeout from "./statement-timeout";

/**
 * Runs the real SQL against the seeded database. Skipped unless DATABASE_URL is set, e.g.
 *   pnpm --filter @envelope/db test:db
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

/** A plot on the east side of Soi Sukhumvit 19; side 0 runs along the soi. */
const SOI_19_PLOT: [number, number][] = [
  [100.5599408, 13.7382914],
  [100.5600231, 13.7388977],
  [100.5604593, 13.7388781],
  [100.5604544, 13.7384977],
  [100.560341, 13.7382129],
];

describe.skipIf(!hasDatabase)("site queries against PostGIS", () => {
  let db: Database;
  let queries: typeof Queries;
  let timeout: typeof Timeout;

  beforeAll(async () => {
    // Imported here so that loading this file without a database does not validate env.
    ({ db } = await import("./client"));
    queries = await import("./site-queries");
    timeout = await import("./statement-timeout");
  });

  afterAll(async () => {
    await db?.$client.end();
  });

  it("matches side 0 of the Soi 19 plot to Soi Sukhumvit 19 and finds a station within 400 m", async () => {
    const context = await queries.getPlotContext(db, SOI_19_PLOT);
    expect(context.sides).toHaveLength(5);
    const side0 = context.sides[0]?.road;
    expect(side0?.nameEn ?? side0?.name).toMatch(/Sukhumvit 19|สุขุมวิท 19/);
    expect(side0?.widthM).toBeGreaterThan(0);
    expect(context.nearestStation).not.toBeNull();
    expect(`${context.nearestStation?.nameEn} ${context.nearestStation?.name}`).toMatch(
      /Asok|Sukhumvit|อโศก|สุขุมวิท/,
    );
    expect(context.nearestStation?.distanceM).toBeLessThan(400);
  });

  it("returns only the station and side roads", async () => {
    const context = await queries.getPlotContext(db, SOI_19_PLOT);
    expect(Object.keys(context).sort()).toEqual(["nearestStation", "sides"]);
  });

  it("bounds queries with a statement timeout that ends with the transaction", async () => {
    const shown = await timeout.withStatementTimeout(db, async (tx) => {
      const result = await tx.execute<{ statement_timeout: string }>(sql`show statement_timeout`);
      return result.rows[0]?.statement_timeout;
    });
    expect(shown).toBe("3s");

    await expect(
      timeout.withStatementTimeout(db, (tx) => tx.execute(sql`select pg_sleep(1)`), 100),
    ).rejects.toMatchObject({ cause: { code: "57014" } });

    // SET LOCAL must not leak to the next user of the pooled connection.
    const after = await db.execute<{ statement_timeout: string }>(sql`show statement_timeout`);
    expect(after.rows[0]?.statement_timeout).not.toBe("100ms");
  });

  it("survives a self-crossing plot", async () => {
    const bowtie: [number, number][] = [
      [100.56, 13.738],
      [100.5605, 13.7385],
      [100.5605, 13.738],
      [100.56, 13.7385],
    ];
    const context = await queries.getPlotContext(db, bowtie);
    expect(context.sides).toHaveLength(4);
  });

  it("reports the loaded snapshot", async () => {
    const info = await queries.getSnapshotInfo(db);
    expect(info?.counts.buildings).toBeGreaterThan(0);
    expect(info?.attribution).toContain("OpenStreetMap");
  });
});
