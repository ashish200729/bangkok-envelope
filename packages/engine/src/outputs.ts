import type { MultiPolygon, Polygon } from "./geo";
import type { EngineInput } from "./inputs";
import type { Citation } from "./law";
import type { RuleId, Unit } from "./rules";

/** A rule as it applies to this plot, shown in the rules panel. */
export type AppliedRule = {
  id: RuleId;
  label: string;
  /** Null when the rule sets no numeric limit here (e.g. no size cap for condos in ย.8–ย.10). */
  value: number | null;
  unit: Unit;
  source: Citation;
  /** True when the rule cuts the 3D envelope (setbacks, height plane, high-rise gate). */
  affectsEnvelope: boolean;
  /** False when the user switched the rule off with a toggle; it is still listed. */
  enabled: boolean;
  /** Which road or condition the line is about, e.g. the road name for per-road rules. */
  note?: string;
};

export type CheckStatus = "pass" | "fail" | "warn" | "n/a";

/** One line of a pass/fail checklist: what the design has against what the rule allows. */
export type Check = {
  ruleId: RuleId;
  label: string;
  status: CheckStatus;
  actual: number | null;
  limit: number | null;
  unit: Unit;
  source: Citation;
  /** Plain sentence for the user, e.g. "Road is 8 m; a high-rise needs at least 10 m". */
  message: string;
};

/** Allowed footprint for heights z0M ≤ z < z1M, in lng/lat. */
export type EnvelopeSlice = {
  z0M: number;
  z1M: number;
  footprint: MultiPolygon;
  areaM2: number;
};

/** The space a building may fill: stacked footprints, each valid over its whole height band. */
export type Envelope = {
  /** Bottom to top, contiguous from 0, no empty slices. */
  slices: readonly EnvelopeSlice[];
  /** Top of the last slice; 0 when nothing fits. Exclusive: the building must stay below it. */
  maxHeightM: number;
  /** Area of the lowest slice; 0 when nothing fits. */
  groundAreaM2: number;
};

/**
 * A low-rise (under 23 m) and a high-rise obey different distances at the same low heights:
 * a high-rise keeps 6 m from every boundary even at its ground floor. So there are two envelopes.
 */
export type Envelopes = {
  /** From the ground to 23 m: road setback, 2 m / 3 m to neighbours, road height plane. */
  lowRise: Envelope;
  /** From the ground up: 6 m clearance on every side and the road height plane. Null when not allowed. */
  highRise: Envelope | null;
};

export type HighRiseAccess = {
  /**
   * Whether the site may hold a building of 23 m or more: site access (unless the high-rise gate
   * is switched off) and room left after the 6 m clearance. False exactly when
   * `envelopes.highRise` is null.
   */
  allowed: boolean;
  /** The site's real situation, even when the gate is switched off. */
  checks: readonly Check[];
  /** Total floor area cap for a high-rise (30,000 m² on a 10–18 m road); null when uncapped. */
  maxGfaM2: number | null;
};

export type FloorUse = "parking" | "lobby" | "residential" | "office" | "hotel";

export type Floor = {
  /** 0 is the ground floor. */
  level: number;
  z0M: number;
  heightM: number;
  use: FloorUse;
  outline: Polygon;
  areaM2: number;
};

export const DESIGN_IDS = ["midrise", "podium-tower", "stepped"] as const;
export type DesignId = (typeof DESIGN_IDS)[number];

export type Design = {
  id: DesignId;
  name: string;
  summary: string;
  /** The envelope the design was fitted to and checked against. */
  envelope: keyof Envelopes;
  /** Bottom to top. gfaM2 is the sum of their areaM2. */
  floors: readonly Floor[];
  heightM: number;
  gfaM2: number;
  farUsed: number;
  footprintM2: number;
  openSpaceM2: number;
  osrUsed: number;
  /** Floor area of the main use (residential, office or hotel floors), the plan's "operating area". */
  useAreaM2: number;
  /** Estimated condo units or hotel rooms; null for offices. */
  keyCount: number | null;
  parking: { requiredSpaces: number; providedSpaces: number };
  checks: readonly Check[];
  /** True when no check failed. */
  passes: boolean;
};

/**
 * Plots the engine cannot evaluate. Shape problems the schema can catch (too few vertices,
 * bad coordinates) are rejected earlier by engineInputSchema.
 */
export type EngineErrorCode =
  /** Fewer than 3 distinct vertices or zero area after cleaning. */
  | "degenerate"
  | "self-intersecting"
  /** Too small to hold any building after setbacks. */
  | "too-small"
  /** No edge faces a public road; Thai law requires road access. */
  | "no-road-edge";

export type EngineSuccess = {
  ok: true;
  version: string;
  plotAreaM2: number;
  rules: readonly AppliedRule[];
  envelopes: Envelopes;
  highRise: HighRiseAccess;
  designs: readonly Design[];
};

export type EngineFailure = {
  ok: false;
  version: string;
  error: { code: EngineErrorCode; message: string };
};

export type EngineResult = EngineSuccess | EngineFailure;

/** The engine's single entry point. Pure: the same input always gives the same result. */
export type Evaluate = (input: EngineInput) => EngineResult;
