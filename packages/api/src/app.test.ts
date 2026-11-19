import { describe, expect, it } from "vitest";
import { type ApiDeps, createApp } from "./app";

const healthyDb: ApiDeps["checkDatabase"] = async () => ({
  postgres: "18.1",
  postgis: "3.5.2",
  latencyMs: 4,
});

function appWith(overrides: Partial<ApiDeps> = {}) {
  return createApp({
    checkDatabase: healthyDb,
    handleAuth: async () => new Response("auth", { status: 200 }),
    getSession: async () => null,
    ...overrides,
  });
}

describe("GET /api/health", () => {
  it("reports ok with database versions when the database answers", async () => {
    const res = await appWith().request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "ok",
      database: { ok: true, postgres: "18.1", postgis: "3.5.2" },
    });
  });

  it("returns 503 with the reason when the database is unreachable", async () => {
    const app = appWith({
      checkDatabase: async () => {
        throw new Error("connection refused");
      },
    });
    const res = await app.request("/api/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      status: "degraded",
      database: { ok: false, error: "connection refused" },
    });
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
});
