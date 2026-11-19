import {
  type Bbox,
  type BuildingsResult,
  bboxAreaKm2,
  bboxContainsPoint,
  bboxRing,
  intersectBbox,
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
import { type RateLimitOptions, rateLimit } from "./site-rate-limit";

type Position = [number, number];

/** Site data access, injected so tests run without a database. */
export type SiteDeps = {
  getBuildings: (bbox: Bbox, limit: number) => Promise<BuildingsResult>;
  getPlotContext: (vertices: Position[]) => Promise<PlotContext>;
  getSnapshotInfo: () => Promise<SnapshotInfo | null>;
};

/** Largest box /buildings serves; about a 1.1 km square, a generous neighbourhood around a plot. */
export const MAX_BBOX_KM2 = 1.2;
/** Largest plot extent /plot-context accepts, as the area of the plot's bounding box. */
export const MAX_PLOT_BBOX_KM2 = 1.2;
export const MAX_BUILDINGS = 5000;
export const MAX_BODY_BYTES = 32 * 1024;
export const DEFAULT_SITE_RATE_LIMIT: RateLimitOptions = { limit: 120, windowMs: 60_000 };

/** The data changes only when the snapshot is reloaded, so browsers and the CDN may cache it. */
const CACHE_GET = "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400";

const NUMBER = /^-?\d{1,3}(?:\.\d{1,12})?$/;

const bboxQuery = z.strictObject({
  bbox: z
    .string()
    .max(120)
    .transform((raw, ctx) => {
      const parts = raw.split(",").map((p) => p.trim());
      if (parts.length !== 4 || parts.some((p) => !NUMBER.test(p))) {
        ctx.addIssue({
          code: "custom",
          message: "bbox must be four numbers: west,south,east,north (degrees)",
        });
        return z.NEVER;
      }
      const [w, s, e, n] = parts.map(Number) as [number, number, number, number];
      if (Math.abs(w) > 180 || Math.abs(e) > 180 || Math.abs(s) > 90 || Math.abs(n) > 90) {
        ctx.addIssue({ code: "custom", message: "bbox is outside valid longitudes and latitudes" });
        return z.NEVER;
      }
      if (w >= e || s >= n) {
        ctx.addIssue({ code: "custom", message: "bbox must have west < east and south < north" });
        return z.NEVER;
      }
      return [w, s, e, n] as Bbox;
    }),
});

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

export function siteRoutes(deps: SiteDeps, limits: RateLimitOptions = DEFAULT_SITE_RATE_LIMIT) {
  return new Hono()
    .use(rateLimit(limits))
    .use(
      limitBody(MAX_BODY_BYTES, (c) =>
        fail(c, 413, "payload_too_large", `Request body must be under ${MAX_BODY_BYTES / 1024} KB`),
      ),
    )
    .get("/area", async (c) => {
      const data = await deps.getSnapshotInfo();
      c.header("Cache-Control", CACHE_GET);
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
    .get("/buildings", zValidator("query", bboxQuery, invalid), async (c) => {
      const { bbox } = c.req.valid("query");
      const clipped = intersectBbox(bbox, STUDY_AREA.bbox);
      if (!clipped) {
        return fail(
          c,
          400,
          "outside_study_area",
          `The box does not overlap the study area (${STUDY_AREA.name}, bbox ${STUDY_AREA.bbox.join(",")})`,
        );
      }
      const areaKm2 = bboxAreaKm2(clipped);
      if (areaKm2 > MAX_BBOX_KM2) {
        return fail(
          c,
          400,
          "bbox_too_large",
          `The box covers ${areaKm2.toFixed(2)} km² of the study area; ask for at most ${MAX_BBOX_KM2} km²`,
        );
      }
      const { features, truncated } = await deps.getBuildings(clipped, MAX_BUILDINGS);
      c.header("Cache-Control", CACHE_GET);
      return c.json({
        type: "FeatureCollection" as const,
        bbox: clipped,
        truncated,
        attribution: OSM_ATTRIBUTION,
        features,
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
          `The plot spans ${plotKm2.toFixed(2)} km²; draw a plot within about 1 km`,
        );
      }
      const inside = vertices.every(([lng, lat]) => bboxContainsPoint(STUDY_AREA.bbox, lng, lat));
      if (!inside) {
        return c.json({
          insideStudyArea: false as const,
          nearestStation: null,
          sides: vertices.map((_, index) => ({ index, road: null })),
          buildingsOnPlot: [] as string[],
        });
      }
      const context = await deps.getPlotContext(vertices);
      return c.json({ insideStudyArea: true as const, ...context });
    });
}
