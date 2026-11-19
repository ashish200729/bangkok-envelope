import { closeRing, type MultiPolygon } from "./geo";
import type { RuleToggles } from "./inputs";
import type { Envelope, EnvelopeSlice } from "./outputs";
import type { PreparedPlot } from "./plot";
import type { Projection } from "./projection";
import { allowedRegion, differenceAreaM2, type LocalPolygon, type Region } from "./region";
import { type EnvelopeKind, edgeDistances } from "./setbacks";

export const BAND_M = 1;
/** Slices smaller than this end the envelope. */
export const MIN_SLICE_AREA_M2 = 1;
/** Footprints that differ by less than this are the same footprint. */
const SAME_FOOTPRINT_M2 = 0.01;

/** One slice in local metres, for design generators. */
export type LocalSlice = { z0M: number; z1M: number; region: Region };

/** Regions keyed by their per-side distances, shared across envelopes of one evaluation. */
export type RegionCache = Map<string, Region>;

/** `below`, a region from a lower height, lets the cut start from it instead of the plot. */
export function regionAt(
  plot: PreparedPlot,
  kind: EnvelopeKind,
  heightM: number,
  toggles: RuleToggles,
  cache: RegionCache = new Map(),
  below?: Region,
): Region {
  const distances = edgeDistances(plot.edges, kind, heightM, toggles);
  const key = distances.map((d) => Math.round(d * 1000)).join(",");
  const cached = cache.get(key);
  if (cached) return cached;
  const region = allowedRegion(plot.vertices, plot.edges, distances, below);
  cache.set(key, region);
  return region;
}

function sameFootprint(a: Region, b: Region): boolean {
  if (a === b) return true;
  return (
    Math.abs(a.areaM2 - b.areaM2) < SAME_FOOTPRINT_M2 && differenceAreaM2(a, b) < SAME_FOOTPRINT_M2
  );
}

/**
 * Stacks 1 m bands from the ground to `ceilingM`, merging bands with the same footprint and
 * stopping at the first band with less than 1 m² left.
 */
export function buildSlices(
  plot: PreparedPlot,
  kind: EnvelopeKind,
  toggles: RuleToggles,
  ceilingM: number,
  cache: RegionCache = new Map(),
): LocalSlice[] {
  const slices: LocalSlice[] = [];
  for (let z0 = 0; z0 < ceilingM; z0 += BAND_M) {
    const z1 = Math.min(z0 + BAND_M, ceilingM);
    const last = slices[slices.length - 1];
    const region = regionAt(plot, kind, z1, toggles, cache, last?.region);
    if (region.areaM2 < MIN_SLICE_AREA_M2) break;
    if (last && sameFootprint(last.region, region)) {
      // Regions only shrink with height, so the top band's region holds for the whole merged slice.
      last.z1M = z1;
      last.region = region;
    } else {
      slices.push({ z0M: z0, z1M: z1, region });
    }
  }
  return slices;
}

function toMultiPolygon(polygons: readonly LocalPolygon[], projection: Projection): MultiPolygon {
  return polygons.map((polygon) => [
    closeRing(polygon.outer.map(projection.toLngLat)),
    ...polygon.holes.map((hole) => closeRing(hole.map(projection.toLngLat))),
  ]);
}

export function toEnvelope(slices: readonly LocalSlice[], projection: Projection): Envelope {
  const out: EnvelopeSlice[] = slices.map((slice) => ({
    z0M: slice.z0M,
    z1M: slice.z1M,
    footprint: toMultiPolygon(slice.region.polygons, projection),
    areaM2: slice.region.areaM2,
  }));
  return {
    slices: out,
    maxHeightM: out[out.length - 1]?.z1M ?? 0,
    groundAreaM2: out[0]?.areaM2 ?? 0,
  };
}
