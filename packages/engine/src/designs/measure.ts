import type { SiteAnalysis } from "../evaluate";
import type { EngineInput } from "../inputs";
import type { Design, FloorUse } from "../outputs";
import type { EnvelopeKind } from "../setbacks";
import { FLOOR_USES } from "../spec";
import { condoUnits, DESIGN_ASSUMPTIONS, hotelRooms, MAIN_USE, unitSizes } from "./assumptions";
import { designChecks, type MeasuredDesign } from "./checks";
import { requiredSpacesFor } from "./parking";
import { EMPTY_PLATE, toPolygon } from "./plates";
import type { BuiltFloor, SliceSet } from "./stack";

/** A floor smaller than this holds no floor area. */
export const MIN_FLOOR_AREA_M2 = 1;

/** A building as cut, before it is measured: the one input generated and edited designs share. */
export type Built = {
  envelope: EnvelopeKind;
  set: SliceSet;
  floors: readonly BuiltFloor[];
  unitSizeM2: number;
};

/** Every `Design` field the floors decide: areas, keys, parking and the checklist. */
export type Measured = Omit<Design, "id" | "name" | "summary" | "spec">;

export function areasByUse(floors: readonly { use: FloorUse; areaM2: number }[]) {
  const areas = Object.fromEntries(FLOOR_USES.map((use) => [use, 0])) as Record<FloorUse, number>;
  for (const f of floors) areas[f.use] += f.areaM2;
  return areas;
}

export function measureDesign(input: EngineInput, site: SiteAnalysis, built: Built): Measured {
  const { projection } = site.plot;
  const plot = site.plot.areaM2;
  const kept = built.floors.map((f) =>
    f.plate.areaM2 < MIN_FLOOR_AREA_M2 ? { ...f, plate: EMPTY_PLATE } : f,
  );
  const floors = kept.map((f, level) => ({
    level,
    z0M: f.z0M,
    heightM: f.heightM,
    use: f.use,
    outline: toPolygon(f.plate, projection),
    areaM2: f.plate.areaM2,
  }));
  const areaByUse = areasByUse(floors);
  const gfaM2 = floors.reduce((s, f) => s + f.areaM2, 0);
  const last = floors[floors.length - 1];
  const heightM = last ? last.z0M + last.heightM : 0;
  const footprintM2 = floors[0]?.areaM2 ?? 0;
  const openSpaceM2 = plot - footprintM2;
  const sizes = unitSizes(input.buildingType, built.unitSizeM2);
  const units = condoUnits(areaByUse.residential, sizes.condoUnitM2);
  const rooms = hotelRooms(areaByUse.hotel, sizes.hotelM2PerKey);
  const keyCount = { condo: units, hotel: rooms, office: null }[input.buildingType];
  const parking = {
    requiredSpaces: requiredSpacesFor({
      areaM2: areaByUse,
      condoUnits: units,
      condoUnitM2: sizes.condoUnitM2,
      hotelRooms: rooms,
      heightM,
    }),
    providedSpaces: Math.floor(areaByUse.parking / DESIGN_ASSUMPTIONS.parkingM2PerSpace.value),
  };
  const measured: MeasuredDesign = {
    envelope: built.envelope,
    set: built.set,
    floors: kept,
    heightM,
    gfaM2,
    farUsed: gfaM2 / plot,
    openSpaceM2,
    osrUsed: gfaM2 > 0 ? openSpaceM2 / gfaM2 : 0,
    areaByUse,
    condoUnits: units,
    hotelRooms: rooms,
    parking,
    emptyLevels: floors.filter((f) => f.areaM2 === 0).map((f) => f.level),
  };
  const checks = designChecks(
    { input, plotAreaM2: plot, frontages: site.frontages, accessChecks: site.highRise.checks },
    measured,
  );
  return {
    envelope: built.envelope,
    floors,
    heightM,
    gfaM2,
    farUsed: measured.farUsed,
    footprintM2,
    openSpaceM2,
    osrUsed: measured.osrUsed,
    useAreaM2: areaByUse[MAIN_USE[input.buildingType]],
    keyCount,
    parking,
    checks,
    passes: !checks.some((c) => c.status === "fail"),
  };
}
