import { z } from "zod";
import { lngLatSchema } from "./geo";

export const ZONE_CODES = ["Y8", "Y9", "Y10"] as const;
export const zoneCodeSchema = z.enum(ZONE_CODES);
export type ZoneCode = z.infer<typeof zoneCodeSchema>;

export const ZONES = {
  Y8: { code: "Y8", labelTh: "ย.8", name: "High-density residential 8" },
  Y9: { code: "Y9", labelTh: "ย.9", name: "High-density residential 9" },
  Y10: { code: "Y10", labelTh: "ย.10", name: "High-density residential 10" },
} as const satisfies Record<ZoneCode, { code: ZoneCode; labelTh: string; name: string }>;

export const BUILDING_TYPES = ["condo", "office", "hotel"] as const;
export const buildingTypeSchema = z.enum(BUILDING_TYPES);
export type BuildingType = z.infer<typeof buildingTypeSchema>;

/** Residential types need 30% open ground; others 10% (MR 33 cl. 6, BMA ordinance cl. 52). */
export const BUILDING_TYPE_INFO = {
  condo: { id: "condo", name: "Condominium", residential: true },
  office: { id: "office", name: "Office", residential: false },
  hotel: { id: "hotel", name: "Hotel", residential: false },
} as const satisfies Record<BuildingType, { id: BuildingType; name: string; residential: boolean }>;

export const roadSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  /** Legal right-of-way (เขตทาง): property line to property line, footpaths and drains included. */
  widthM: z.number().positive().max(200),
  widthSource: z.enum(["user", "osm-tag", "osm-estimate"]),
});
export type Road = z.infer<typeof roadSchema>;

/** Edge i runs from vertex i to vertex i + 1 (the last edge closes back to vertex 0). */
export const plotEdgeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("road"), roadId: z.string().min(1) }),
  z.object({ kind: z.literal("boundary") }),
]);
export type PlotEdge = z.infer<typeof plotEdgeSchema>;

export const plotSchema = z
  .object({
    /** Open ring: the first vertex is not repeated at the end. Any winding. */
    vertices: z.array(lngLatSchema).min(3).max(200),
    edges: z.array(plotEdgeSchema),
  })
  .superRefine((plot, ctx) => {
    if (plot.edges.length !== plot.vertices.length) {
      ctx.addIssue({
        code: "custom",
        path: ["edges"],
        message: `Expected one edge per vertex (${plot.vertices.length}), got ${plot.edges.length}`,
      });
    }
    const first = plot.vertices[0];
    const last = plot.vertices[plot.vertices.length - 1];
    if (first && last && plot.vertices.length > 1 && first[0] === last[0] && first[1] === last[1]) {
      ctx.addIssue({
        code: "custom",
        path: ["vertices"],
        message: "Pass an open ring: drop the repeated closing vertex",
      });
    }
  });
export type Plot = z.infer<typeof plotSchema>;

export const siteSchema = z.object({
  /**
   * Straight-line distance to the nearest rail transit station, for the plan's 500 m
   * exceptions. Null when unknown, which counts as "not within 500 m".
   */
  stationDistanceM: z.number().nonnegative().nullable(),
});
export type Site = z.infer<typeof siteSchema>;

/** Switch individual rules off to see how each one shapes the envelope. */
export const ruleTogglesSchema = z.object({
  roadSetback: z.boolean(),
  boundarySetback: z.boolean(),
  roadHeightPlane: z.boolean(),
  highRiseGate: z.boolean(),
  openSpace: z.boolean(),
});
export type RuleToggles = z.infer<typeof ruleTogglesSchema>;

export const ALL_RULES_ON: RuleToggles = {
  roadSetback: true,
  boundarySetback: true,
  roadHeightPlane: true,
  highRiseGate: true,
  openSpace: true,
};

export const MAX_FAR_BONUS_PCT = 20;

export const engineInputSchema = z
  .object({
    plot: plotSchema,
    roads: z.array(roadSchema).max(8),
    zone: zoneCodeSchema,
    buildingType: buildingTypeSchema,
    /** Claimed FAR bonus under 2013 plan cl. 51–57, in percent of base FAR. */
    farBonusPct: z.number().min(0).max(MAX_FAR_BONUS_PCT),
    site: siteSchema,
    toggles: ruleTogglesSchema,
  })
  .superRefine((input, ctx) => {
    const ids = new Set<string>();
    input.roads.forEach((road, index) => {
      if (ids.has(road.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["roads", index, "id"],
          message: `Duplicate road id "${road.id}"`,
        });
      }
      ids.add(road.id);
    });
    input.plot.edges.forEach((edge, index) => {
      if (edge.kind === "road" && !ids.has(edge.roadId)) {
        ctx.addIssue({
          code: "custom",
          path: ["plot", "edges", index, "roadId"],
          message: `Edge ${index} faces road "${edge.roadId}", which is not in roads`,
        });
      }
    });
  });
export type EngineInput = z.infer<typeof engineInputSchema>;
