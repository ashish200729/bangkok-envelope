/**
 * Zoning rules engine. Pure TypeScript with no framework or I/O imports, so the browser
 * (live updates) and the server (saved projects, reports) run the same code.
 */

export {
  buildCustomDesign,
  buildDesigns,
  customDesign,
  defaultFloorSpec,
  defaultTowerSpec,
  describeSpecChange,
  limitsFor,
  USE_LABEL,
} from "./designs";
export {
  type Assumption,
  type Confidence,
  condoUnits,
  DESIGN_ASSUMPTIONS,
  defaultUnitSizeM2,
  floorHeightM,
  hotelRooms,
  keyCount,
  MAIN_USE,
  USE_FLOOR_HEIGHT_M,
  unitSizes,
} from "./designs/assumptions";
export { EIA_RULES } from "./designs/checks";
export {
  isLargeBuilding,
  PARKING_RULES,
  type ParkingNeed,
  requiredSpaces,
  requiredSpacesFor,
  spacesByUse,
  type UseMix,
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
  type BuildCustomDesign,
  type Check,
  type CheckStatus,
  type CustomDesign,
  type CustomDesignId,
  type CustomDesignResult,
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
export {
  distanceM,
  makeProjection,
  type Projection,
  ringAreaM2,
  ringCentroid,
  type XY,
} from "./projection";
export { allowedRegion, type LocalPolygon, type Region, stadium } from "./region";
export { RULE_IDS, RULE_INFO, type RuleId, type Unit } from "./rules";
export {
  boundaryDistanceM,
  farLimit,
  LAW,
  openSpaceMin,
  roadPlaneDistanceM,
  roadSetbackM,
  type SizedUse,
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
export {
  type DesignSpec,
  designSpecSchema,
  FLOOR_USES,
  type FloorSpec,
  floorSpecSchema,
  floorUseSchema,
  MAX_FLOORS,
  MAX_INSET_M,
  PLATE_SOURCES,
  type TowerSpec,
  towerSpecSchema,
} from "./spec";
export { ENGINE_VERSION } from "./version";
