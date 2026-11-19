import type { DatabaseHealth } from "@envelope/db";
import { ENGINE_VERSION } from "@envelope/engine";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { type RateLimitOptions, rateLimit } from "./rate-limit";
import { type SiteDeps, siteRoutes } from "./routes/site";

type SessionSummary = {
  userId: string;
  isAnonymous: boolean;
  expiresAt: string;
};

export type ApiRateLimits = {
  /** Every /api/* request, per client. */
  api: RateLimitOptions;
  /** `POST /api/auth/sign-in/anonymous`, per client, on top of `api`. Each call creates a user row. */
  anonymousSignIn: RateLimitOptions;
};

/** Everything the API touches outside itself, injected so tests run without a database. */
export type ApiDeps = {
  checkDatabase: () => Promise<DatabaseHealth>;
  handleAuth: (request: Request) => Promise<Response>;
  getSession: (headers: Headers) => Promise<SessionSummary | null>;
  site: SiteDeps;
  /**
   * Whether /api/health may show versions, timings and driver errors. False in production, where
   * they only help an attacker fingerprint the stack.
   */
  exposeDetails: boolean;
  /** Defaults to DEFAULT_RATE_LIMITS. */
  rateLimits?: Partial<ApiRateLimits>;
};

export const DEFAULT_RATE_LIMITS: ApiRateLimits = {
  api: { limit: 120, windowMs: 60_000 },
  anonymousSignIn: { limit: 10, windowMs: 10 * 60_000 },
};

export type ApiError = { error: { code: string; message: string; requestId: string } };

/** Hono's own errors (a body that is not JSON is a 400) in the API's documented codes. */
const HTTP_ERROR_CODES: Partial<Record<number, string>> = { 400: "invalid_request" };

export function createApp(deps: ApiDeps) {
  const limits = { ...DEFAULT_RATE_LIMITS, ...deps.rateLimits };
  const limitAnonymousSignIn = rateLimit(limits.anonymousSignIn);

  const checkQuietly = async () => {
    try {
      await deps.checkDatabase();
      return true;
    } catch (error) {
      console.error("health: database check failed", error);
      return false;
    }
  };

  const app = new Hono()
    .basePath("/api")
    .use(requestId())
    .use(logger())
    .use(rateLimit(limits.api))
    .use("/auth/sign-in/anonymous", (c, next) =>
      c.req.method === "POST" ? limitAnonymousSignIn(c, next) : next(),
    )
    .on(["GET", "POST"], "/auth/*", (c) => deps.handleAuth(c.req.raw))
    // In production a middleware answers /health with the bare summary. Being middleware, it stays
    // out of AppType, so the typed client keeps the detailed shape that only the dev /status page
    // reads.
    .use("/health", async (c, next) => {
      if (deps.exposeDetails || c.req.method !== "GET") return next();
      const ok = await checkQuietly();
      c.header("Cache-Control", "no-store");
      return ok
        ? c.json({ status: "ok", database: { ok: true } })
        : c.json({ status: "degraded", database: { ok: false } }, 503);
    })
    .get("/health", async (c) => {
      c.header("Cache-Control", "no-store");
      let database: DatabaseHealth | null = null;
      let failure: unknown = null;
      try {
        database = await deps.checkDatabase();
      } catch (error) {
        console.error("health: database check failed", error);
        failure = error;
      }

      const base = { version: ENGINE_VERSION, time: new Date().toISOString() };
      if (database) {
        return c.json({
          status: "ok" as const,
          ...base,
          database: { ok: true as const, ...database },
        });
      }
      return c.json(
        {
          status: "degraded" as const,
          ...base,
          database: {
            ok: false as const,
            error: failure instanceof Error ? failure.message : "Database unreachable",
          },
        },
        503,
      );
    })
    .get("/me", async (c) => {
      const session = await deps.getSession(c.req.raw.headers);
      return c.json({ session });
    })
    .route("/site", siteRoutes(deps.site));

  app.notFound((c) =>
    c.json<ApiError>(
      { error: { code: "not_found", message: "No such API route", requestId: c.get("requestId") } },
      404,
    ),
  );

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      const code = HTTP_ERROR_CODES[error.status] ?? "http_error";
      return c.json<ApiError>(
        { error: { code, message: error.message, requestId: c.get("requestId") } },
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
