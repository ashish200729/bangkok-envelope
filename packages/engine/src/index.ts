/**
 * Zoning rules engine. Pure TypeScript with no framework or I/O imports, so the browser
 * (live updates) and the server (saved projects, reports) run the same code.
 */

export { buildDesigns, limitsFor } from "./designs";
export {
  type Assumption,
  type Confidence,
  DESIGN_ASSUMPTIONS,
  floorHeightM,
  keyCount,
} from "./designs/assumptions";
export { EIA_RULES } from "./designs/checks";
export {
  isLargeBuilding,
  PARKING_RULES,
  type ParkingNeed,
  requiredSpaces,
} from "./designs/parking";
export {
  BAND_M,
  buildSlices,
  type LocalSlice,
  MIN_SLICE_AREA_M2,
  type RegionCache,
  regionAt,
  toEnvelope,
} from "./envelope";
export { analyseSite, ENVELOPE_CEILING_M, evaluate, type SiteAnalysis } from "./evaluate";
export { SAMPLE_INPUT } from "./fixtures";
export {
  closeRing,
  type LinearRing,
  type LngLat,
  lngLatSchema,
  type MultiPolygon,
  type Polygon,
} from "./geo";
export { assessHighRise, type RoadFrontage, roadFrontages } from "./high-rise";
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
  type Envelopes,
  type Evaluate,
  type Floor,
  type FloorUse,
  type HighRiseAccess,
} from "./outputs";
export {
  checkPlotShape,
  distanceToSegment,
  type EdgeSide,
  type LocalEdge,
  type PlotError,
  type PreparedPlot,
  preparePlot,
  signedArea,
} from "./plot";
export { makeProjection, type Projection, ringCentroid, type XY } from "./projection";
export { allowedRegion, type LocalPolygon, type Region, stadium } from "./region";
export { RULE_IDS, RULE_INFO, type RuleId, type Unit } from "./rules";
export {
  boundaryDistanceM,
  farLimit,
  LAW,
  openSpaceMin,
  roadPlaneDistanceM,
  roadSetbackM,
  type Sourced,
  sizeCapForUse,
  stationCounts,
  USE_SIZE_RULES,
  type UseSizeLimit,
  type UseSizeRule,
  type UseSizeTier,
  ZONE_RULES,
  type ZoneRules,
} from "./rules-data";
export { type EnvelopeKind, edgeDistances } from "./setbacks";
export { ENGINE_VERSION } from "./version";
