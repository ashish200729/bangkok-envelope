/**
 * Zoning rules engine. Pure TypeScript with no framework or I/O imports, so the browser
 * (live updates) and the server (saved projects, reports) run the same code.
 */

export { SAMPLE_INPUT } from "./fixtures";
export {
  closeRing,
  type LinearRing,
  type LngLat,
  lngLatSchema,
  type MultiPolygon,
  type Polygon,
} from "./geo";
export {
  ALL_RULES_ON,
  BUILDING_TYPE_INFO,
  BUILDING_TYPES,
  type BuildingType,
  buildingTypeSchema,
  type EngineInput,
  engineInputSchema,
  MAX_FAR_BONUS_PCT,
  type Plot,
  type PlotEdge,
  plotEdgeSchema,
  plotSchema,
  type Road,
  type RuleToggles,
  roadSchema,
  ruleTogglesSchema,
  type Site,
  siteSchema,
  ZONE_CODES,
  ZONES,
  type ZoneCode,
  zoneCodeSchema,
} from "./inputs";
export { type Citation, formatCitation, LAWS, type Law, type LawId } from "./law";
export {
  type AppliedRule,
  type Check,
  type CheckStatus,
  DESIGN_IDS,
  type Design,
  type DesignId,
  type EngineErrorCode,
  type EngineFailure,
  type EngineResult,
  type EngineSuccess,
  type Envelope,
  type EnvelopeSlice,
  type Evaluate,
  type Floor,
  type FloorUse,
} from "./outputs";
export { RULE_IDS, RULE_INFO, type RuleId, type Unit } from "./rules";
export { ENGINE_VERSION } from "./version";
