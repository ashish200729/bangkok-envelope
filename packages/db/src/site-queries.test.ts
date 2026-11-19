import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "./client";
import type * as Queries from "./site-queries";

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

  beforeAll(async () => {
    // Imported here so that loading this file without a database does not validate env.
    ({ db } = await import("./client"));
    queries = await import("./site-queries");
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

  it("returns buildings around Asok with heights, nearest the centre first", async () => {
    const result = await queries.getSiteBuildings(db, [100.558, 13.736, 100.562, 13.74], 5000);
    expect(result.features.length).toBeGreaterThan(50);
    expect(result.truncated).toBe(false);
    const first = result.features[0];
    expect(first?.geometry.type).toBe("MultiPolygon");
    expect(first?.properties.heightM).toBeGreaterThan(0);
  });

  it("caps the feature count and says so", async () => {
    const result = await queries.getSiteBuildings(db, [100.558, 13.736, 100.562, 13.74], 10);
    expect(result.features).toHaveLength(10);
    expect(result.truncated).toBe(true);
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
