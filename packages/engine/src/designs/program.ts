import type { BuildingType } from "../inputs";
import { DESIGN_ASSUMPTIONS } from "./assumptions";
import { requiredSpaces } from "./parking";
import { insetToArea } from "./plates";
import type { PlannedFloor, Scheme, UseBudget } from "./stack";

/** Legal caps a design must stay within, in m². */
export type Limits = {
  plotAreaM2: number;
  /** Total floor area allowed by FAR and, for high-rises, the FAR ceiling and road cap. */
  gfaM2: number;
  /** OSR minimum, or null when open space is switched off. */
  osrMin: number | null;
  /** Footprints to try, largest first: the open-ground cap, then smaller ones that leave OSR room. */
  groundCapsM2: readonly number[];
  /** Main-use area allowed by the plan's use-size cap. */
  useAreaM2: number;
};

export type Layout = { floors: PlannedFloor[]; useAreaM2: number; parkingAreaM2: number };

const MAX_PARKING_FLOORS = 12;
const SEARCH_STEPS = 40;

const isUse = (f: PlannedFloor) => f.use !== "lobby" && f.use !== "parking";

function areaOf(floors: readonly PlannedFloor[], keep: (f: PlannedFloor) => boolean): number {
  return floors.reduce((sum, f) => (keep(f) ? sum + f.plate.areaM2 : sum), 0);
}

export function gfaCapFor(limits: Limits, footprintM2: number): number {
  const osrCap =
    limits.osrMin === null
      ? Number.POSITIVE_INFINITY
      : (limits.plotAreaM2 - footprintM2) / limits.osrMin;
  return Math.min(limits.gfaM2, osrCap);
}

export function budgetFor(limits: Limits): UseBudget {
  return (nonUseM2, footprintM2) =>
    Math.min(gfaCapFor(limits, footprintM2) - nonUseM2, limits.useAreaM2);
}

type Fit = {
  floors: PlannedFloor[];
  /** Main-use area that also meets the parking rule. */
  useM2: number;
  /** Main-use area allowed by the caps alone. */
  capM2: number;
  parkingOk: boolean;
  osrBound: boolean;
};

/** The most main-use area this stack can hold within the caps and with enough parking. */
function fit(floors: PlannedFloor[], limits: Limits, buildingType: BuildingType): Fit {
  const footprint = floors[0]?.plate.areaM2 ?? 0;
  const lobby = areaOf(floors, (f) => f.use === "lobby");
  const parking = areaOf(floors, (f) => f.use === "parking");
  const uses = floors.filter(isUse);
  const capacity = areaOf(uses, () => true);
  const gfaRoom = gfaCapFor(limits, footprint) - lobby - parking;
  const capM2 = Math.max(0, Math.min(gfaRoom, limits.useAreaM2, capacity));
  const osrBound =
    gfaCapFor(limits, footprint) < limits.gfaM2 && gfaRoom <= Math.min(limits.useAreaM2, capacity);
  const provided = Math.floor(parking / DESIGN_ASSUMPTIONS.parkingM2PerSpace.value);
  const baseTop = floors.filter((f) => !isUse(f)).reduce((z, f) => z + f.heightM, 0);
  const heightFor = (useM2: number): number => {
    let sum = 0;
    for (const f of uses) {
      if (sum >= useM2) return f.z0M;
      sum += f.plate.areaM2;
    }
    const last = uses[uses.length - 1];
    return last ? last.z0M + last.heightM : baseTop;
  };
  const ok = (useM2: number) =>
    provided >=
    requiredSpaces(buildingType, {
      useAreaM2: useM2,
      otherAreaM2: lobby,
      totalAreaM2: lobby + parking + useM2,
      heightM: useM2 > 0 ? heightFor(useM2) : baseTop,
    });
  if (ok(capM2)) return { floors, useM2: capM2, capM2, parkingOk: true, osrBound };
  let lo = 0;
  let hi = capM2;
  for (let step = 0; step < SEARCH_STEPS; step++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return { floors, useM2: lo, capM2, parkingOk: ok(lo), osrBound };
}

function score(f: Fit, minM2: number): [number, number] {
  return f.parkingOk && f.useM2 >= minM2 ? [1, f.useM2] : [0, f.capM2];
}

function better(a: Fit, b: Fit | undefined, minM2: number): boolean {
  if (!b) return true;
  const [ta, va] = score(a, minM2);
  const [tb, vb] = score(b, minM2);
  if (ta !== tb) return ta > tb;
  if (Math.abs(va - vb) > 0.5) return va > vb;
  return a.floors.length < b.floors.length;
}

/**
 * Tries footprints and numbers of parking floors, and keeps the stack that holds the most
 * main-use area with enough parking. Ground uses are tried in order (a lobby first); a later one
 * (parking on the ground floor) only when no earlier one meets the parking rule, as on small
 * plots. Parking floors are whole floors, so no floor overhangs a smaller one below; the spare
 * spaces are reported as provided.
 */
export function bestLayout(
  scheme: Scheme,
  limits: Limits,
  buildingType: BuildingType,
): Layout | null {
  const budget = budgetFor(limits);
  let best: Fit | undefined;
  for (const ground of scheme.grounds) {
    if (best && score(best, scheme.minPartialM2)[0] === 1) break;
    for (const cap of limits.groundCapsM2) {
      let osrBound = false;
      for (let parkingFloors = 0; parkingFloors <= MAX_PARKING_FLOORS; parkingFloors++) {
        const floors = scheme.stack({ ground, parkingFloors }, cap, budget);
        if (!floors) break;
        const result = fit(floors, limits, buildingType);
        if (better(result, best, scheme.minPartialM2)) best = result;
        osrBound ||= result.osrBound;
        if (result.parkingOk && result.useM2 >= result.capM2 - 1e-6) break;
      }
      if (!osrBound) break;
    }
  }
  if (!best) return null;
  const [tier] = score(best, scheme.minPartialM2);
  return realise(best.floors, tier === 1 ? best.useM2 : best.capM2, scheme.minPartialM2);
}

/** Keeps whole main-use floors up to `useM2` and trims the last one by an even inset. */
function realise(
  floors: readonly PlannedFloor[],
  useM2: number,
  minPartialM2: number,
): Layout | null {
  const out = floors.filter((f) => !isUse(f));
  let stacked = 0;
  for (const floor of floors.filter(isUse)) {
    const room = useM2 - stacked;
    if (room < minPartialM2) break;
    if (floor.plate.areaM2 <= room + 1e-6) {
      out.push(floor);
      stacked += floor.plate.areaM2;
      continue;
    }
    const trimmed = insetToArea(floor.plate, room);
    if (trimmed.areaM2 >= minPartialM2) {
      out.push({ ...floor, plate: trimmed, sliceIndex: -1 });
      stacked += trimmed.areaM2;
    }
    break;
  }
  if (stacked < minPartialM2) return null;
  return {
    floors: out,
    useAreaM2: stacked,
    parkingAreaM2: areaOf(out, (f) => f.use === "parking"),
  };
}
