import type { PlotContext, SnapshotInfo } from "@envelope/db/site";
import { describe, expect, it } from "vitest";
import { type ApiDeps, createApp } from "../app";
import type { SiteDeps } from "./site";

type Calls = { plots: [number, number][][] };

const context: PlotContext = {
  nearestStation: { name: "อโศก", nameEn: "Asok", network: "BTS", distanceM: 310 },
  sides: [
    {
      index: 0,
      road: {
        osmId: "way/1",
        name: "ซอยสุขุมวิท 19",
        nameEn: "Soi Sukhumvit 19",
        class: "residential",
        widthM: 8,
        widthSource: "osm-estimate",
        distanceM: 5.2,
      },
    },
    { index: 1, road: null },
    { index: 2, road: null },
  ],
};

function appWith(site: Partial<SiteDeps> = {}, overrides: Partial<ApiDeps> = {}) {
  const calls: Calls = { plots: [] };
  const app = createApp({
    checkDatabase: async () => ({ postgres: "18", postgis: "3.6", latencyMs: 1 }),
    handleAuth: async () => new Response(null, { status: 204 }),
    getSession: async () => null,
    exposeDetails: true,
    site: {
      getPlotContext: async (vertices) => {
        calls.plots.push(vertices);
        return context;
      },
      getSnapshotInfo: async () => null,
      ...site,
    },
    ...overrides,
  });
  return { app, calls };
}

const PLOT = [
  [100.5599408, 13.7382914],
  [100.5600231, 13.7388977],
  [100.5604593, 13.7388781],
  [100.5604544, 13.7384977],
  [100.560341, 13.7382129],
];

const postPlot = (app: ReturnType<typeof appWith>["app"], body: unknown, headers = {}) =>
  app.request("/api/site/plot-context", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function errorCode(res: Response) {
  return ((await res.json()) as { error: { code: string; message: string } }).error;
}

describe("POST /api/site/plot-context", () => {
  it("returns the plot's context and passes the vertices through", async () => {
    const { app, calls } = appWith();
    const res = await postPlot(app, { vertices: PLOT.slice(0, 3) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ insideStudyArea: true, ...context });
    expect(calls.plots).toEqual([PLOT.slice(0, 3)]);
  });

  it("answers insideStudyArea false without querying for a plot outside the area", async () => {
    const { app, calls } = appWith();
    const res = await postPlot(app, {
      vertices: [
        [100.5, 13.7],
        [100.501, 13.7],
        [100.501, 13.701],
      ],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      insideStudyArea: false,
      nearestStation: null,
      sides: [
        { index: 0, road: null },
        { index: 1, road: null },
        { index: 2, road: null },
      ],
    });
    expect(calls.plots).toHaveLength(0);
  });

  it.each([
    ["two vertices", { vertices: PLOT.slice(0, 2) }],
    [
      "201 vertices",
      { vertices: Array.from({ length: 201 }, (_, i) => [100.56 + i * 1e-6, 13.74]) },
    ],
    ["a vertex with three numbers", { vertices: [[100.56, 13.74, 5], ...PLOT.slice(1)] }],
    ["a string coordinate", { vertices: [["100.56", 13.74], ...PLOT.slice(1)] }],
    ["a latitude out of range", { vertices: [[100.56, 95], ...PLOT.slice(1)] }],
    ["no vertices", {}],
    ["an extra field", { vertices: PLOT, sql: "drop table" }],
    ["null", null],
  ])("rejects %s with 400", async (_label, body) => {
    const { app, calls } = appWith();
    const res = await postPlot(app, body);
    expect(res.status).toBe(400);
    expect((await errorCode(res)).code).toBe("invalid_request");
    expect(calls.plots).toHaveLength(0);
  });

  it("rejects NaN, which is not JSON", async () => {
    const { app } = appWith();
    const res = await postPlot(app, '{"vertices":[[NaN,13.74],[100.56,13.74],[100.56,13.75]]}');
    expect(res.status).toBe(400);
  });

  /** A triangle whose bounding box is a square of about `sideM` metres near Asok. */
  const triangle = (sideM: number) => {
    const dLng = sideM / 108_135;
    const dLat = sideM / 110_574;
    return [
      [100.556, 13.736],
      [100.556 + dLng, 13.736],
      [100.556 + dLng, 13.736 + dLat],
    ];
  };

  it("rejects a plot spanning more than about 500 m without querying", async () => {
    const { app, calls } = appWith();
    const res = await postPlot(app, { vertices: triangle(600) });
    expect(res.status).toBe(400);
    const error = await errorCode(res);
    expect(error.code).toBe("plot_too_large");
    expect(error.message).toContain("within about 500 m");
    expect(calls.plots).toHaveLength(0);
  });

  it("accepts a plot of about 450 m across", async () => {
    const { app, calls } = appWith();
    const res = await postPlot(app, { vertices: triangle(450) });
    expect(res.status).toBe(200);
    expect(calls.plots).toHaveLength(1);
  });

  it("hides database errors, such as a statement timeout, behind a generic 500", async () => {
    const { app } = appWith({
      getPlotContext: async () => {
        throw new Error("canceling statement due to statement timeout (user neondb_owner)");
      },
    });
    const res = await postPlot(app, { vertices: PLOT });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("neondb_owner");
    expect(JSON.parse(text).error.code).toBe("internal");
  });

  it("does not return buildings on the plot", async () => {
    const { app } = appWith();
    const res = await postPlot(app, { vertices: PLOT });
    expect(Object.keys((await res.json()) as object).sort()).toEqual([
      "insideStudyArea",
      "nearestStation",
      "sides",
    ]);
  });

  it("rejects bodies over 32 KB with 413", async () => {
    const { app } = appWith();
    const res = await postPlot(app, { vertices: PLOT, pad: "x".repeat(40_000) });
    expect(res.status).toBe(413);
    expect((await errorCode(res)).code).toBe("payload_too_large");
  });

  const streamed = (text: string) =>
    new Request("http://localhost/api/site/plot-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);

  it("measures streamed bodies that declare no length", async () => {
    const { app } = appWith();
    const big = await app.request(
      streamed(JSON.stringify({ vertices: PLOT, pad: "x".repeat(40_000) })),
    );
    expect(big.status).toBe(413);
    const ok = await app.request(streamed(JSON.stringify({ vertices: PLOT })));
    expect(ok.status).toBe(200);
  });

  it("answers an unsupported method with 404, not 500", async () => {
    const { app } = appWith();
    const res = await app.request("/api/site/area", { method: "DELETE", body: "x" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/site/area", () => {
  it("returns the study area polygon and attribution, with null data before seeding", async () => {
    const { app } = appWith();
    const res = await app.request("/api/site/area");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      geometry: { coordinates: number[][][] };
      attribution: string;
      data: unknown;
    };
    expect(body.attribution).toContain("OpenStreetMap");
    expect(body.geometry.coordinates[0]).toHaveLength(5);
    expect(body.data).toBeNull();
    // A cached null would hide the data for a day after seeding.
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("is cacheable once the snapshot is loaded", async () => {
    const snapshot: SnapshotInfo = {
      source: "overpass",
      attribution: "© OpenStreetMap contributors",
      license: "ODbL",
      licenseUrl: "https://www.openstreetmap.org/copyright",
      fetchedAt: "2026-11-18T00:00:00.000Z",
      osmBaseAt: "2026-06-01T00:00:00.000Z",
      bbox: [100.547, 13.728, 100.575, 13.752],
      counts: { buildings: 5766, roads: 1691, stations: 7 },
    };
    const { app } = appWith({ getSnapshotInfo: async () => snapshot });
    const res = await app.request("/api/site/area");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=86400");
    expect(((await res.json()) as { data: unknown }).data).toEqual(snapshot);
  });
});
