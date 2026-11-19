import { z } from "zod";

/**
 * An editable recipe for a building. The engine turns a spec into a `Design` (floors cut to the
 * chosen envelope, areas, parking, the full checklist), so every edit in the design studio is
 * re-checked by the same rules as the generated designs. Plain JSON: it crosses the worker, is
 * kept in browser storage, and is what the AI assistant proposes.
 */

export const FLOOR_USES = [
  "lobby",
  "parking",
  "retail",
  "amenity",
  "residential",
  "office",
  "hotel",
] as const;
export const floorUseSchema = z.enum(FLOOR_USES);

/** How a floor's plate is found. */
export const PLATE_SOURCES = ["envelope", "tower"] as const;

export const MAX_FLOORS = 80;
export const MAX_INSET_M = 40;

export const floorSpecSchema = z.strictObject({
  use: floorUseSchema,
  /** Floor to floor; the statutory minimum for rooms is 2.6 m (MR 55 cl. 22). */
  heightM: z.number().min(2.6).max(8),
  /**
   * "envelope": the whole allowed region at this floor's top, shrunk by `insetM`.
   * "tower": the design's tower rectangle, cut to the allowed region.
   */
  plate: z.enum(PLATE_SOURCES),
  /** Extra inward offset from the allowed region's edge, in metres (0 = fill it). */
  insetM: z.number().min(0).max(MAX_INSET_M),
});

export const towerSpecSchema = z.strictObject({
  /** Rectangle size in metres; width runs along `rotationDeg`. */
  widthM: z.number().min(8).max(120),
  depthM: z.number().min(8).max(120),
  /** Direction of the width, clockwise from east in degrees: 0 east, 90 south, -90 north. */
  rotationDeg: z.number().min(-180).max(180),
  /**
   * Centre offset in metres (x east, y north) from the site's deepest buildable point: the
   * centre of what is left after the deepest even inward offset of the low-rise envelope's
   * ground slice. It moves only when the plot, its roads or the setback toggles change.
   */
  offsetM: z.strictObject({ x: z.number().min(-200).max(200), y: z.number().min(-200).max(200) }),
});

export const designSpecSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(60),
    /** The envelope every floor is cut to and checked against. */
    envelope: z.enum(["lowRise", "highRise"]),
    /**
     * When false, plates are not cut to the envelope, so a floor may stick out and the
     * "Every floor inside the envelope" check fails. The user sees what breaks instead of the
     * edit being silently refused.
     */
    fitToEnvelope: z.boolean(),
    /**
     * When true, every floor is cut to the envelope at the top of the highest floor that fits
     * (the strictest height), not at its own top, so the walls rise straight with no steps.
     */
    straight: z.boolean(),
    /** Bottom to top. A floor never extends past the floor below. */
    floors: z.array(floorSpecSchema).min(1).max(MAX_FLOORS),
    /** Required when any floor has a "tower" plate. */
    tower: towerSpecSchema.nullable(),
    /**
     * Average net unit size of residential floors, or gross floor area per room of hotel floors
     * in a hotel. The other lodging use keeps its default (`DESIGN_ASSUMPTIONS`).
     */
    unitSizeM2: z.number().min(20).max(400),
  })
  .refine((spec) => spec.tower !== null || spec.floors.every((f) => f.plate !== "tower"), {
    message: "Tower floors need a tower rectangle",
    path: ["tower"],
  });

export type FloorUseSpec = z.infer<typeof floorUseSchema>;
export type FloorSpec = z.infer<typeof floorSpecSchema>;
export type TowerSpec = z.infer<typeof towerSpecSchema>;
export type DesignSpec = z.infer<typeof designSpecSchema>;
