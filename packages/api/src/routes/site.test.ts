import type { Bbox, PlotContext } from "@envelope/db/site";
import { describe, expect, it } from "vitest";
import { type ApiDeps, createApp } from "../app";
import type { SiteDeps } from "./site";

type Calls = { buildings: { bbox: Bbox; limit: number }[]; plots: [number, number][][] };

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
  buildingsOnPlot: ["way/9"],
};

function appWith(site: Partial<SiteDeps> = {}, overrides: Partial<ApiDeps> = {}) {
  const calls: Calls = { buildings: [], plots: [] };
  const app = createApp({
    checkDatabase: async () => ({ postgres: "18", postgis: "3.6", latencyMs: 1 }),
    handleAuth: async () => new Response(null, { status: 204 }),
    getSession: async () => null,
    site: {
      getBuildings: async (bbox, limit) => {
        calls.buildings.push({ bbox, limit });
        return { features: [], truncated: false };
      },
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

describe("GET /api/site/buildings", () => {
  it("returns a FeatureCollection for a small box inside the study area, cacheable", async () => {
    const { app, calls } = appWith();
    const res = await app.request("/api/site/buildings?bbox=100.558,13.736,100.562,13.740");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age");
    expect(await res.json()).toMatchObject({ type: "FeatureCollection", truncated: false });
    expect(calls.buildings).toEqual([{ bbox: [100.558, 13.736, 100.562, 13.74], limit: 5000 }]);
  });

  it("clips a box that crosses the study area's edge", async () => {
    const { app, calls } = appWith();
    const res = await app.request("/api/site/buildings?bbox=100.540,13.736,100.550,13.740");
    expect(res.status).toBe(200);
    expect(calls.buildings[0]?.bbox).toEqual([100.547, 13.736, 100.55, 13.74]);
  });

  it.each([
    ["missing", ""],
    ["three numbers", "?bbox=100.55,13.73,100.56"],
    ["five numbers", "?bbox=1,2,3,4,5"],
    ["words", "?bbox=a,b,c,d"],
    ["NaN", "?bbox=NaN,13.73,100.56,13.74"],
    ["Infinity", "?bbox=100.55,13.73,Infinity,13.74"],
    ["empty parts", "?bbox=,,,"],
    ["exponents", "?bbox=1e2,13.73,100.56,13.74"],
    ["inverted", "?bbox=100.56,13.73,100.55,13.74"],
    ["out of range", "?bbox=100.55,13.73,200,13.74"],
    ["an unknown parameter", "?bbox=100.558,13.736,100.562,13.740&x=1"],
  ])("rejects a bbox that is %s with 400", async (_label, query) => {
    const { app, calls } = appWith();
    const res = await app.request(`/api/site/buildings${query}`);
    expect(res.status).toBe(400);
    expect((await errorCode(res)).code).toBe("invalid_request");
    expect(calls.buildings).toHaveLength(0);
  });

  it("rejects a box outside the study area", async () => {
    const { app } = appWith();
    const res = await app.request("/api/site/buildings?bbox=100.50,13.70,100.51,13.71");
    expect(res.status).toBe(400);
    expect((await errorCode(res)).code).toBe("outside_study_area");
  });

  it("rejects a box larger than 1.2 km²", async () => {
    const { app } = appWith();
    const res = await app.request("/api/site/buildings?bbox=100.548,13.729,100.574,13.751");
    expect(res.status).toBe(400);
    const error = await errorCode(res);
    expect(error.code).toBe("bbox_too_large");
    expect(error.message).toMatch(/km²/);
  });

  it("hides database errors behind a generic 500", async () => {
    const { app } = appWith({
      getBuildings: async () => {
        throw new Error("password authentication failed for user neondb_owner");
      },
    });
    const res = await app.request("/api/site/buildings?bbox=100.558,13.736,100.562,13.740");
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("neondb_owner");
    expect(JSON.parse(text).error.code).toBe("internal");
  });
});

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
      buildingsOnPlot: [],
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

  it("rejects a plot spanning more than about a kilometre", async () => {
    const { app } = appWith();
    const res = await postPlot(app, {
      vertices: [
        [100.548, 13.73],
        [100.574, 13.73],
        [100.574, 13.75],
      ],
    });
    expect(res.status).toBe(400);
    expect((await errorCode(res)).code).toBe("plot_too_large");
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
  });
});

describe("rate limit on /api/site/*", () => {
  it("allows the limit per client per window, then answers 429 with Retry-After", async () => {
    let now = 0;
    const { app } = appWith({}, { siteRateLimit: { limit: 2, windowMs: 1000, now: () => now } });
    const get = (ip: string) =>
      app.request("/api/site/area", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });

    expect((await get("1.1.1.1")).status).toBe(200);
    now = 400;
    expect((await get("1.1.1.1")).status).toBe(200);
    const limited = await get("1.1.1.1");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("1");
    expect((await errorCode(limited)).code).toBe("rate_limited");

    expect((await get("2.2.2.2")).status).toBe(200);

    now = 1001;
    expect((await get("1.1.1.1")).status).toBe(200);
  });

  it("does not limit other API routes", async () => {
    const { app } = appWith({}, { siteRateLimit: { limit: 1, windowMs: 60_000 } });
    await app.request("/api/site/area");
    expect((await app.request("/api/site/area")).status).toBe(429);
    expect((await app.request("/api/health")).status).toBe(200);
  });
});
