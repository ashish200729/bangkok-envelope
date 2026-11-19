import type { Paths64 } from "clipper2-ts";
import type { LocalSlice } from "../envelope";
import type { FloorUse } from "../outputs";
import type { FloorSpec, TowerSpec } from "../spec";
import { DESIGN_ASSUMPTIONS } from "./assumptions";
import { type Inset, insetToArea, intersect, largestPiece, type Plate } from "./plates";

export type GroundUse = "lobby" | "parking";

/** What goes below the main use: the ground floor and a number of whole parking floors. */
export type Program = { ground: GroundUse; parkingFloors: number };

/** A floor as the measuring and checking code sees it. */
export type BuiltFloor = { use: FloorUse; z0M: number; heightM: number; plate: Plate };

/** How a generated floor was cut, in the terms of a `FloorSpec`. */
export type Recipe = Pick<FloorSpec, "plate" | "insetM">;

export type PlannedFloor = BuiltFloor & {
  /** Index of the envelope slice the plate was cut to; -1 when it was cut to something else too. */
  sliceIndex: number;
  recipe: Recipe;
  /** The un-inset shape the plate was cut from; trimming the floor insets this. */
  basis: () => Plate;
  /** The tower rectangle of a "tower" floor. */
  tower?: TowerSpec;
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

/** A tower rectangle in Clipper units, with a key for memoising the plates cut from it. */
export type TowerRect = { spec: TowerSpec; paths: Paths64; key: string };

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
  private readonly insets = new Map<string, Inset>();

  constructor(readonly set: SliceSet) {}

  private remember(key: string, make: () => Plate): Plate {
    const hit = this.memo.get(key);
    if (hit) return hit;
    const made = make();
    this.memo.set(key, made);
    return made;
  }

  /** The largest connected piece of a slice's region. */
  piece(index: number): Plate {
    return this.remember(`p${index}`, () =>
      largestPiece(this.set.slices[index]?.region.paths ?? []),
    );
  }

  /** The largest piece of a slice, shrunk evenly until it covers at most `capM2`. */
  ground(index: number, capM2: number): Inset {
    const key = `${index}|${capM2}`;
    const hit = this.insets.get(key);
    if (hit) return hit;
    const made = insetToArea(this.piece(index), capM2);
    this.insets.set(key, made);
    return made;
  }

  /** The part of `below` inside a slice; a plate already cut to that slice is returned as is. */
  within(index: number, below: PlannedFloor): Plate {
    if (below.sliceIndex === index) return below.plate;
    return this.remember(`w${index}|${below.plate.id}`, () =>
      intersect(this.set.slices[index]?.region.paths ?? [], below.plate.paths),
    );
  }

  /** The tower rectangle cut to a slice. */
  towerIn(index: number, rect: TowerRect): Plate {
    return this.remember(`t${index}|${rect.key}`, () =>
      intersect(rect.paths, this.set.slices[index]?.region.paths ?? []),
    );
  }

  /** The tower rectangle cut to a slice and kept inside the floor below. */
  towerWithin(index: number, rect: TowerRect, below: Plate): Plate {
    return this.remember(`tw${index}|${rect.key}|${below.id}`, () =>
      intersect(this.towerIn(index, rect).paths, below.paths),
    );
  }
}

/**
 * Ground, parking floors, then main-use floors, each as large as its slice allows and never
 * larger than the floor below. Main-use floors stop at the budget, the envelope's top, or when a
 * plate gets smaller than `minPlateM2`. With `towerOn`, main-use floors are a tower rectangle
 * (chosen on the podium's top floor) cut to each slice.
 */
export function steppedStack(options: {
  cache: PlateCache;
  program: Program;
  use: FloorUse;
  useHeightM: number;
  groundCapM2: number;
  budget: UseBudget;
  minPlateM2: number;
  towerOn?: (podiumTop: Plate) => TowerRect | null;
}): PlannedFloor[] | null {
  const { cache, program } = options;
  const floors: PlannedFloor[] = [];
  let z = 0;
  for (const spec of nonUseFloors(program)) {
    const top = roundM(z + spec.heightM);
    const index = sliceIndexForTop(cache.set, top);
    if (index === null) return null;
    const below = floors[floors.length - 1];
    const ground = below ? null : cache.ground(index, options.groundCapM2);
    const plate = below ? cache.within(index, below) : (ground?.plate ?? cache.piece(index));
    if (plate.areaM2 < DESIGN_ASSUMPTIONS.minFloorM2.value) return null;
    floors.push({
      use: spec.use,
      z0M: z,
      heightM: spec.heightM,
      plate,
      sliceIndex: index,
      recipe: { plate: "envelope", insetM: ground?.insetM ?? 0 },
      basis: () => cache.piece(index),
    });
    z = top;
  }
  const nonUse = floors.reduce((sum, f) => sum + f.plate.areaM2, 0);
  const need = options.budget(nonUse, floors[0]?.plate.areaM2 ?? 0);
  const podiumTop = floors[floors.length - 1];
  const rect = podiumTop && options.towerOn ? options.towerOn(podiumTop.plate) : null;
  if (options.towerOn && !rect) return floors;
  let below: PlannedFloor | undefined = podiumTop;
  let stacked = 0;
  while (below && stacked < need) {
    const top = roundM(z + options.useHeightM);
    const index = sliceIndexForTop(cache.set, top);
    if (index === null) break;
    const plate = rect ? cache.towerWithin(index, rect, below.plate) : cache.within(index, below);
    if (plate.areaM2 < options.minPlateM2) break;
    const floor: PlannedFloor = rect
      ? {
          use: options.use,
          z0M: z,
          heightM: options.useHeightM,
          plate,
          sliceIndex: -1,
          recipe: { plate: "tower", insetM: 0 },
          basis: () => cache.towerIn(index, rect),
          tower: rect.spec,
        }
      : {
          use: options.use,
          z0M: z,
          heightM: options.useHeightM,
          plate,
          sliceIndex: index,
          recipe: { plate: "envelope", insetM: 0 },
          basis: () => cache.piece(index),
        };
    floors.push(floor);
    stacked += plate.areaM2;
    below = floor;
    z = top;
  }
  return floors;
}
