import type { LocalSlice } from "../envelope";
import type { FloorUse } from "../outputs";
import { DESIGN_ASSUMPTIONS } from "./assumptions";
import { insetToArea, intersect, largestPiece, type Plate } from "./plates";

export type GroundUse = "lobby" | "parking";

/** What goes below the main use: the ground floor and a number of whole parking floors. */
export type Program = { ground: GroundUse; parkingFloors: number };

export type PlannedFloor = {
  use: FloorUse;
  z0M: number;
  heightM: number;
  plate: Plate;
  /** Index of the envelope slice the plate was cut to; -1 when it was cut to something else too. */
  sliceIndex: number;
};

/** How much main-use floor area is worth stacking, given the area outside the main use and the footprint. */
export type UseBudget = (nonUseM2: number, footprintM2: number) => number;

export type Scheme = {
  grounds: readonly GroundUse[];
  /** The smallest partial top floor worth keeping. */
  minPartialM2: number;
  /** Whole floors for this program, or null when its ground and parking floors do not fit. */
  stack(program: Program, groundCapM2: number, budget: UseBudget): PlannedFloor[] | null;
};

/** An envelope's slices and, for the low-rise, the height the building must stay below. */
export type SliceSet = { slices: readonly LocalSlice[]; topBelowM: number | null };

const EPS_M = 1e-6;

/** The slice holding the top of a floor that ends at `topM`, or null when it leaves the envelope. */
export function sliceIndexForTop(set: SliceSet, topM: number): number | null {
  if (set.topBelowM !== null && topM >= set.topBelowM - EPS_M) return null;
  const i = set.slices.findIndex((s) => s.z0M < topM - EPS_M && topM <= s.z1M + EPS_M);
  return i < 0 ? null : i;
}

export function roundM(z: number): number {
  return Math.round(z * 1e6) / 1e6;
}

export function nonUseFloors(program: Program): { use: FloorUse; heightM: number }[] {
  const a = DESIGN_ASSUMPTIONS;
  const ground =
    program.ground === "lobby"
      ? { use: "lobby" as const, heightM: a.lobbyHeightM.value }
      : { use: "parking" as const, heightM: a.parkingFloorHeightM.value };
  const parking = Array.from({ length: program.parkingFloors }, () => ({
    use: "parking" as const,
    heightM: a.parkingFloorHeightM.value,
  }));
  return [ground, ...parking];
}

/** Plates cut from one slice set, remembered across the programs a design tries. */
export class PlateCache {
  private readonly memo = new Map<string, Plate>();

  constructor(readonly set: SliceSet) {}

  private remember(key: string, make: () => Plate): Plate {
    const hit = this.memo.get(key);
    if (hit) return hit;
    const made = make();
    this.memo.set(key, made);
    return made;
  }

  /** The largest piece of a slice, shrunk evenly until it covers at most `capM2`. */
  ground(index: number, capM2: number): Plate {
    return this.remember(`g${index}|${capM2}`, () => {
      const region = this.set.slices[index]?.region.paths ?? [];
      return insetToArea(largestPiece(region), capM2);
    });
  }

  /** The part of `below` inside a slice; a plate already cut to that slice is returned as is. */
  within(index: number, below: PlannedFloor | Plate): Plate {
    if ("plate" in below && below.sliceIndex === index) return below.plate;
    const plate = "plate" in below ? below.plate : below;
    return this.remember(`w${index}|${plate.id}`, () =>
      intersect(this.set.slices[index]?.region.paths ?? [], plate.paths),
    );
  }
}

/**
 * Ground, parking floors, then main-use floors, each as large as its slice allows and never
 * larger than the floor below. Main-use floors stop at the budget, the envelope's top, or when a
 * plate gets smaller than `minPlateM2`. `narrowToTower` shrinks the plate under the first main-use floor to a tower plate.
 */
export function steppedStack(options: {
  cache: PlateCache;
  program: Program;
  use: FloorUse;
  useHeightM: number;
  groundCapM2: number;
  budget: UseBudget;
  minPlateM2: number;
  narrowToTower?: (below: Plate) => Plate;
}): PlannedFloor[] | null {
  const { cache, program } = options;
  const floors: PlannedFloor[] = [];
  let z = 0;
  for (const spec of nonUseFloors(program)) {
    const top = roundM(z + spec.heightM);
    const index = sliceIndexForTop(cache.set, top);
    if (index === null) return null;
    const below = floors[floors.length - 1];
    const plate = below ? cache.within(index, below) : cache.ground(index, options.groundCapM2);
    if (plate.areaM2 < DESIGN_ASSUMPTIONS.minFloorM2.value) return null;
    floors.push({ use: spec.use, z0M: z, heightM: spec.heightM, plate, sliceIndex: index });
    z = top;
  }
  const nonUse = floors.reduce((sum, f) => sum + f.plate.areaM2, 0);
  const need = options.budget(nonUse, floors[0]?.plate.areaM2 ?? 0);
  let below: PlannedFloor | Plate | undefined = floors[floors.length - 1];
  if (below && options.narrowToTower) below = options.narrowToTower(below.plate);
  let stacked = 0;
  while (below && stacked < need) {
    const top = roundM(z + options.useHeightM);
    const index = sliceIndexForTop(cache.set, top);
    if (index === null) break;
    const plate = cache.within(index, below);
    if (plate.areaM2 < options.minPlateM2) break;
    const floor = {
      use: options.use,
      z0M: z,
      heightM: options.useHeightM,
      plate,
      sliceIndex: index,
    };
    floors.push(floor);
    stacked += plate.areaM2;
    below = floor;
    z = top;
  }
  return floors;
}
