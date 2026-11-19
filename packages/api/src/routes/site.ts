import {
  type Bbox,
  bboxAreaKm2,
  bboxContainsPoint,
  bboxRing,
  OSM_ATTRIBUTION,
  OSM_LICENSE,
  OSM_LICENSE_URL,
  type PlotContext,
  type SnapshotInfo,
  STUDY_AREA,
} from "@envelope/db/site";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { ApiError } from "../app";
import { limitBody } from "./site-body-limit";

type Position = [number, number];

/** Site data access, injected so tests run without a database. */
export type SiteDeps = {
  getPlotContext: (vertices: Position[]) => Promise<PlotContext>;
  getSnapshotInfo: () => Promise<SnapshotInfo | null>;
};

/**
 * Largest plot extent /plot-context accepts, as the area of the plot's bounding box: about a
 * 500 m square, far beyond any real development plot, and it bounds the work one request causes.
 */
export const MAX_PLOT_BBOX_KM2 = 0.25;
export const MAX_BODY_BYTES = 32 * 1024;

/** The data changes only when the snapshot is reloaded, so browsers and the CDN may cache it. */
const CACHE_GET = "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400";

const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const plotContextBody = z.strictObject({
  vertices: z
    .array(lngLat)
    .min(3, "A plot needs at least 3 corners")
    .max(200, "A plot can have at most 200 corners"),
});

function fail(c: Context, status: ContentfulStatusCode, code: string, message: string) {
  return c.json<ApiError>({ error: { code, message, requestId: c.get("requestId") } }, status);
}

/** zod-validator hook that answers in the API's error shape with the first issue's message. */
function invalid(
  result: { success: true } | { success: false; error: z.core.$ZodError },
  c: Context,
) {
  if (result.success) return;
  const issue = result.error.issues[0];
  const where = issue && issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return fail(c, 400, "invalid_request", `${where}${issue?.message ?? "Invalid request"}`);
}

function boundsOf(vertices: Position[]): Bbox {
  const lngs = vertices.map((v) => v[0]);
  const lats = vertices.map((v) => v[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

export function siteRoutes(deps: SiteDeps) {
  return new Hono()
    .use(
      limitBody(MAX_BODY_BYTES, (c) =>
        fail(c, 413, "payload_too_large", `Request body must be under ${MAX_BODY_BYTES / 1024} KB`),
      ),
    )
    .get("/area", async (c) => {
      const data = await deps.getSnapshotInfo();
      // Before seeding, a cached null would outlive the seed by a day at the CDN.
      c.header("Cache-Control", data ? CACHE_GET : "no-store");
      return c.json({
        id: STUDY_AREA.id,
        name: STUDY_AREA.name,
        bbox: STUDY_AREA.bbox,
        geometry: { type: "Polygon" as const, coordinates: [bboxRing(STUDY_AREA.bbox)] },
        attribution: OSM_ATTRIBUTION,
        license: OSM_LICENSE,
        licenseUrl: OSM_LICENSE_URL,
        /** Null until the snapshot has been loaded into the database. */
        data,
      });
    })
    .post("/plot-context", zValidator("json", plotContextBody, invalid), async (c) => {
      const { vertices } = c.req.valid("json");
      c.header("Cache-Control", "no-store");
      const plotKm2 = bboxAreaKm2(boundsOf(vertices));
      if (plotKm2 > MAX_PLOT_BBOX_KM2) {
        return fail(
          c,
          400,
          "plot_too_large",
          `The plot spans ${plotKm2.toFixed(2)} km²; draw a plot within about 500 m`,
        );
      }
      const inside = vertices.every(([lng, lat]) => bboxContainsPoint(STUDY_AREA.bbox, lng, lat));
      if (!inside) {
        return c.json({
          insideStudyArea: false as const,
          nearestStation: null,
          sides: vertices.map((_, index) => ({ index, road: null })),
        });
      }
      const context = await deps.getPlotContext(vertices);
      return c.json({ insideStudyArea: true as const, ...context });
    });
}
