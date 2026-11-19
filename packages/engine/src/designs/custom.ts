import type { Paths64 } from "clipper2-ts";
import { analyseSite, type SiteAnalysis } from "../evaluate";
import { formatNumber } from "../format";
import type { EngineInput } from "../inputs";
import type { BuildCustomDesign, CustomDesignId, CustomDesignResult, FloorUse } from "../outputs";
import { LAW } from "../rules-data";
import { type DesignSpec, FLOOR_USES } from "../spec";
import { measureDesign } from "./measure";
import { cutPlate, EMPTY_PLATE, intersect, type Plate, ringPaths } from "./plates";
import { type BuiltFloor, roundM, type SliceSet, sliceIndexForTop } from "./stack";
import { siteAnchor, towerRect } from "./tower";

const USE_NOUN = {
  lobby: "lobby floor",
  parking: "parking floor",
  retail: "retail floor",
  amenity: "amenity floor",
  residential: "residential floor",
  office: "office floor",
  hotel: "hotel floor",
} as const satisfies Record<FloorUse, string>;

export function sliceSetFor(site: SiteAnalysis, envelope: DesignSpec["envelope"]): SliceSet {
  return envelope === "lowRise"
    ? { slices: site.lowRise, topBelowM: LAW.highRiseThresholdM.value }
    : { slices: site.highRiseGeometry ?? [], topBelowM: null };
}

/**
 * Floors bottom-up from the ground. Each plate is the allowed region for the floor's whole band
 * (the region at its top, or at the top of the highest floor that fits when the design is
 * straight) or the tower rectangle cut to it, shrunk by `insetM` and kept inside the floor
 * below. Without `fitToEnvelope` the region is the plot itself, so the checklist shows the breach.
 */
export function cutFloors(site: SiteAnalysis, spec: DesignSpec, set: SliceSet): BuiltFloor[] {
  const tops: number[] = [];
  let z = 0;
  for (const floor of spec.floors) {
    z = roundM(z + floor.heightM);
    tops.push(z);
  }
  const fitting = tops.filter((top) => sliceIndexForTop(set, top) !== null);
  const straightTop = fitting[fitting.length - 1];
  const straightIndex =
    spec.straight && straightTop !== undefined ? sliceIndexForTop(set, straightTop) : null;

  const plot = spec.fitToEnvelope ? null : ringPaths(site.plot.vertices);
  const rect = spec.tower ? towerRect(siteAnchor(site.lowRise), spec.tower) : null;
  const towerCuts = new Map<number, Plate>();
  const regionFor = (top: number): { key: number; paths: Paths64 } | null => {
    if (plot) return { key: -1, paths: plot };
    const own = sliceIndexForTop(set, top);
    if (own === null) return null;
    const index = straightIndex ?? own;
    const slice = set.slices[index];
    return slice ? { key: index, paths: slice.region.paths } : null;
  };
  const towerIn = (region: { key: number; paths: Paths64 }, tower: Paths64): Plate => {
    const hit = towerCuts.get(region.key);
    if (hit) return hit;
    const cut = intersect(tower, region.paths);
    towerCuts.set(region.key, cut);
    return cut;
  };

  const floors: BuiltFloor[] = [];
  let below: Plate | null = null;
  let z0 = 0;
  spec.floors.forEach((floor, i) => {
    const top = tops[i] ?? z0;
    const region = regionFor(top);
    const base =
      region === null
        ? null
        : floor.plate === "envelope"
          ? region.paths
          : rect
            ? towerIn(region, rect.paths)
            : null;
    const plate = base === null ? EMPTY_PLATE : cutPlate(base, floor.insetM, below);
    floors.push({ use: floor.use, z0M: z0, heightM: floor.heightM, plate });
    below = plate;
    z0 = top;
  });
  return floors;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function summary(spec: DesignSpec, heightM: number): string {
  const parts = FLOOR_USES.map((use) => {
    const n = spec.floors.filter((f) => f.use === use).length;
    return n > 0 ? plural(n, USE_NOUN[use]) : null;
  }).filter((s): s is string => s !== null);
  const list =
    parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `${plural(spec.floors.length, "storey")}, ${formatNumber(heightM, 1)} m tall: ${list}.`;
}

/** An edited design on an analysed site. */
export function customDesign(
  input: EngineInput,
  site: SiteAnalysis,
  spec: DesignSpec,
  id: CustomDesignId,
): CustomDesignResult {
  const set = sliceSetFor(site, spec.envelope);
  const floors = cutFloors(site, spec, set);
  const measured = measureDesign(input, site, {
    envelope: spec.envelope,
    set,
    floors,
    unitSizeM2: spec.unitSizeM2,
  });
  if (measured.gfaM2 === 0) {
    return {
      ok: false,
      error: {
        code: "empty-design",
        message:
          "No floor of this design has any area left after cutting it to the envelope and the floor below. Lower the insets, move the tower onto the plot or switch the envelope.",
      },
    };
  }
  return {
    ok: true,
    design: { id, name: spec.name, summary: summary(spec, measured.heightM), spec, ...measured },
  };
}

let lastSite: { key: string; site: SiteAnalysis } | null = null;

/** The site analysis for an input, remembered for the latest input: the studio edits only the spec. */
export function siteFor(input: EngineInput): ReturnType<typeof analyseSite> {
  const key = JSON.stringify(input);
  if (lastSite?.key === key) return { ok: true, site: lastSite.site };
  const analysis = analyseSite(input);
  if (analysis.ok) lastSite = { key, site: analysis.site };
  return analysis;
}

export const buildCustomDesign: BuildCustomDesign = (input, spec, id) => {
  const analysis = siteFor(input);
  if (!analysis.ok) return { ok: false, error: analysis.error };
  return customDesign(input, analysis.site, spec, id);
};
