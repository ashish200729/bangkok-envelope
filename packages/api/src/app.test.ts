import { describe, expect, it } from "vitest";
import { type ApiDeps, createApp } from "./app";

const healthyDb: ApiDeps["checkDatabase"] = async () => ({
  postgres: "18.1",
  postgis: "3.5.2",
  latencyMs: 4,
});

const downDb: ApiDeps["checkDatabase"] = async () => {
  throw new Error("connection refused for user neondb_owner");
};

function appWith(overrides: Partial<ApiDeps> = {}) {
  return createApp({
    checkDatabase: healthyDb,
    handleAuth: async () => new Response("auth", { status: 200 }),
    getSession: async () => null,
    site: {
      getPlotContext: async () => ({ nearestStation: null, sides: [] }),
      getSnapshotInfo: async () => null,
    },
    exposeDetails: true,
    ...overrides,
  });
}

async function errorOf(res: Response) {
  return ((await res.json()) as { error: { code: string; message: string } }).error;
}

describe("GET /api/health outside production", () => {
  it("reports ok with database versions when the database answers", async () => {
    const res = await appWith().request("/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toMatchObject({
      status: "ok",
      database: { ok: true, postgres: "18.1", postgis: "3.5.2" },
    });
  });

  it("returns 503 with the reason when the database is unreachable", async () => {
    const res = await appWith({ checkDatabase: downDb }).request("/api/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      status: "degraded",
      database: { ok: false, error: "connection refused for user neondb_owner" },
    });
  });
});

describe("GET /api/health in production", () => {
  it("says only that the API and database are up", async () => {
    const res = await appWith({ exposeDetails: false }).request("/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "ok", database: { ok: true } });
  });

  it("answers 503 without versions or the driver's error", async () => {
    const res = await appWith({ exposeDetails: false, checkDatabase: downDb }).request(
      "/api/health",
    );
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ status: "degraded", database: { ok: false } });
    expect(text).not.toContain("neondb_owner");
  });
});

describe("routing", () => {
  it("forwards /api/auth/* to the auth handler untouched", async () => {
    const seen: string[] = [];
    const app = appWith({
      handleAuth: async (req) => {
        seen.push(new URL(req.url).pathname);
        return new Response(null, { status: 204 });
      },
    });
    const res = await app.request("/api/auth/sign-in/anonymous", { method: "POST" });
    expect(res.status).toBe(204);
    expect(seen).toEqual(["/api/auth/sign-in/anonymous"]);
  });

  it("returns the session summary from /api/me", async () => {
    const session = { userId: "u1", isAnonymous: true, expiresAt: "2026-12-01T00:00:00.000Z" };
    const res = await appWith({ getSession: async () => session }).request("/api/me");
    expect(await res.json()).toEqual({ session });
  });

  it("answers unknown routes with a JSON 404 carrying a request id", async () => {
    const res = await appWith().request("/api/nope");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe("not_found");
    expect(body.error.requestId).toBeTruthy();
  });

  it("no longer serves /api/site/buildings", async () => {
    const res = await appWith().request("/api/site/buildings?bbox=100.558,13.736,100.562,13.740");
    expect(res.status).toBe(404);
  });
});

describe("rate limit on every /api/* route", () => {
  const from = (ip: string) => ({ headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });

  it("allows the limit per client per window, then answers 429 with Retry-After", async () => {
    let now = 0;
    const app = appWith({ rateLimits: { api: { limit: 2, windowMs: 1000, now: () => now } } });

    expect((await app.request("/api/site/area", from("1.1.1.1"))).status).toBe(200);
    now = 400;
    expect((await app.request("/api/health", from("1.1.1.1"))).status).toBe(200);
    const limited = await app.request("/api/me", from("1.1.1.1"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("1");
    expect(limited.headers.get("Cache-Control")).toBe("no-store");
    expect((await errorOf(limited)).code).toBe("rate_limited");

    expect((await app.request("/api/site/area", from("2.2.2.2"))).status).toBe(200);

    now = 1001;
    expect((await app.request("/api/site/area", from("1.1.1.1"))).status).toBe(200);
  });

  it("covers auth, health, me, site and unknown routes", async () => {
    const paths: [string, RequestInit?][] = [
      ["/api/health"],
      ["/api/me"],
      ["/api/site/area"],
      ["/api/auth/get-session"],
      ["/api/nope"],
    ];
    for (const [path, init] of paths) {
      const app = appWith({ rateLimits: { api: { limit: 1, windowMs: 60_000 } } });
      await app.request(path, init);
      expect((await app.request(path, init)).status, path).toBe(429);
    }
  });

  it("limits anonymous sign-in more tightly, before the auth handler runs", async () => {
    let authCalls = 0;
    const app = appWith({
      handleAuth: async () => {
        authCalls += 1;
        return new Response(null, { status: 200 });
      },
      rateLimits: { anonymousSignIn: { limit: 2, windowMs: 600_000 } },
    });
    const signIn = (ip: string) =>
      app.request("/api/auth/sign-in/anonymous", { method: "POST", ...from(ip) });

    expect((await signIn("1.1.1.1")).status).toBe(200);
    expect((await signIn("1.1.1.1")).status).toBe(200);
    const limited = await signIn("1.1.1.1");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(500);
    expect(authCalls).toBe(2);

    expect((await signIn("2.2.2.2")).status).toBe(200);
    // Other auth endpoints keep the general limit.
    const session = await app.request("/api/auth/get-session", from("1.1.1.1"));
    expect(session.status).toBe(200);
  });

  it("defaults to 10 anonymous sign-ins per 10 minutes per client", async () => {
    const app = appWith();
    for (let i = 0; i < 10; i += 1) {
      const res = await app.request("/api/auth/sign-in/anonymous", { method: "POST" });
      expect(res.status).toBe(200);
    }
    const res = await app.request("/api/auth/sign-in/anonymous", { method: "POST" });
    expect(res.status).toBe(429);
  });
});
