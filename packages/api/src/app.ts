import type { DatabaseHealth } from "@envelope/db";
import { ENGINE_VERSION } from "@envelope/engine";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";

type SessionSummary = {
  userId: string;
  isAnonymous: boolean;
  expiresAt: string;
};

/** Everything the API touches outside itself, injected so tests run without a database. */
export type ApiDeps = {
  checkDatabase: () => Promise<DatabaseHealth>;
  handleAuth: (request: Request) => Promise<Response>;
  getSession: (headers: Headers) => Promise<SessionSummary | null>;
};

export type ApiError = { error: { code: string; message: string; requestId: string } };

export function createApp(deps: ApiDeps) {
  const app = new Hono()
    .basePath("/api")
    .use(requestId())
    .use(logger())
    .on(["GET", "POST"], "/auth/*", (c) => deps.handleAuth(c.req.raw))
    .get("/health", async (c) => {
      const base = { version: ENGINE_VERSION, time: new Date().toISOString() };
      try {
        const database = await deps.checkDatabase();
        return c.json({
          status: "ok" as const,
          ...base,
          database: { ok: true as const, ...database },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown database error";
        console.error("health: database check failed", error);
        return c.json(
          {
            status: "degraded" as const,
            ...base,
            database: { ok: false as const, error: message },
          },
          503,
        );
      }
    })
    .get("/me", async (c) => {
      const session = await deps.getSession(c.req.raw.headers);
      return c.json({ session });
    });

  app.notFound((c) =>
    c.json<ApiError>(
      { error: { code: "not_found", message: "No such API route", requestId: c.get("requestId") } },
      404,
    ),
  );

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json<ApiError>(
        { error: { code: "http_error", message: error.message, requestId: c.get("requestId") } },
        error.status,
      );
    }
    console.error("api: unhandled error", error);
    return c.json<ApiError>(
      {
        error: { code: "internal", message: "Something went wrong", requestId: c.get("requestId") },
      },
      500,
    );
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
