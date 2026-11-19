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
  insetM: z.number().min(0).max(40),
});

export const towerSpecSchema = z.strictObject({
  /** Rectangle size in metres; width runs along `rotationDeg`. */
  widthM: z.number().min(8).max(120),
  depthM: z.number().min(8).max(120),
  /** Clockwise from east, in degrees. */
  rotationDeg: z.number().min(-180).max(180),
  /** Centre offset in metres from the plot's deepest buildable point (x east, y north). */
  offsetM: z.strictObject({ x: z.number().min(-200).max(200), y: z.number().min(-200).max(200) }),
});

export const designSpecSchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  /** The envelope every floor is cut to and checked against. */
  envelope: z.enum(["lowRise", "highRise"]),
  /**
   * When false, plates are not cut to the envelope, so a floor may stick out and the
   * "Every floor inside the envelope" check fails. The user sees what breaks instead of the
   * edit being silently refused.
   */
  fitToEnvelope: z.boolean(),
  /** Bottom to top. A floor never extends past the floor below. */
  floors: z.array(floorSpecSchema).min(1).max(80),
  tower: towerSpecSchema.nullable(),
  /** Average net unit size (condo) or gross floor area per key (hotel); ignored for offices. */
  unitSizeM2: z.number().min(20).max(400),
});

export type FloorUseSpec = z.infer<typeof floorUseSchema>;
export type FloorSpec = z.infer<typeof floorSpecSchema>;
export type TowerSpec = z.infer<typeof towerSpecSchema>;
export type DesignSpec = z.infer<typeof designSpecSchema>;
