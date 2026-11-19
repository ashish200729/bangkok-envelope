import { appliedRules } from "./applied-rules";
import { buildSlices, type LocalSlice, type RegionCache, regionAt, toEnvelope } from "./envelope";
import { assessHighRise, type RoadFrontage, roadFrontages } from "./high-rise";
import type { EngineInput } from "./inputs";
import type { EngineFailure, Evaluate, HighRiseAccess } from "./outputs";
import { type PlotError, type PreparedPlot, preparePlot } from "./plot";
import { LAW } from "./rules-data";
import { ENGINE_VERSION } from "./version";

/**
 * A computational ceiling, not a legal limit: aviation limits are out of scope, and with the road
 * height plane switched off nothing else stops a high-rise envelope.
 */
export const ENVELOPE_CEILING_M = 300;

/** Everything a design generator needs, in local metres. */
export type SiteAnalysis = {
  plot: PreparedPlot;
  frontages: readonly RoadFrontage[];
  lowRise: readonly LocalSlice[];
  /** Null exactly when `highRise.allowed` is false. */
  highRiseSlices: readonly LocalSlice[] | null;
  highRise: HighRiseAccess;
  cache: RegionCache;
};

export function analyseSite(
  input: EngineInput,
): { ok: true; site: SiteAnalysis } | { ok: false; error: PlotError } {
  const prepared = preparePlot(input.plot, input.roads);
  if (!prepared.ok) return prepared;
  const { plot } = prepared;
  const { toggles } = input;
  const cache: RegionCache = new Map();
  const threshold = LAW.highRiseThresholdM.value;

  const lowRise = buildSlices(plot, "lowRise", toggles, threshold, cache);
  if (lowRise.length === 0) {
    return {
      ok: false,
      error: {
        code: "too-small",
        message:
          "After the road setback and the distance to neighbouring plots, no part of the plot is left to build on. Enlarge the plot or check the road width.",
      },
    };
  }
  const frontages = roadFrontages(plot.edges);
  const areaAtThreshold = regionAt(plot, "highRise", threshold, toggles, cache).areaM2;
  const highRise = assessHighRise(frontages, areaAtThreshold, toggles);
  const highRiseSlices = highRise.allowed
    ? buildSlices(plot, "highRise", toggles, ENVELOPE_CEILING_M, cache)
    : null;
  return { ok: true, site: { plot, frontages, lowRise, highRiseSlices, highRise, cache } };
}

export const evaluate: Evaluate = (input) => {
  const analysis = analyseSite(input);
  if (!analysis.ok) {
    const failure: EngineFailure = { ok: false, version: ENGINE_VERSION, error: analysis.error };
    return failure;
  }
  const { site } = analysis;
  const { projection } = site.plot;
  return {
    ok: true,
    version: ENGINE_VERSION,
    plotAreaM2: site.plot.areaM2,
    rules: appliedRules(input, site.frontages),
    envelopes: {
      lowRise: toEnvelope(site.lowRise, projection),
      highRise: site.highRiseSlices ? toEnvelope(site.highRiseSlices, projection) : null,
    },
    highRise: site.highRise,
    designs: [],
  };
};
