import type { FloorUse } from "../outputs";
import { DESIGN_ASSUMPTIONS } from "./assumptions";
import {
  nonUseFloors,
  type PlannedFloor,
  type PlateCache,
  type Program,
  roundM,
  type Scheme,
  sliceIndexForTop,
  type UseBudget,
} from "./stack";

/**
 * A straight block under 23 m: every floor has the same outline, the low-rise envelope at the
 * building's top (the strictest height) capped to the open-ground footprint. Taller blocks get
 * smaller plates where the road plane and the 3 m neighbour distance bite, so each height is tried.
 */
export function midRiseScheme(cache: PlateCache, use: FloorUse, useHeightM: number): Scheme {
  const minFloor = DESIGN_ASSUMPTIONS.minFloorM2.value;

  function stack(program: Program, groundCapM2: number, budget: UseBudget): PlannedFloor[] | null {
    const base = nonUseFloors(program);
    const baseTop = base.reduce((z, f) => z + f.heightM, 0);
    let best: { floors: PlannedFloor[]; held: number } | undefined;
    for (let count = 1; ; count++) {
      const top = roundM(baseTop + count * useHeightM);
      const index = sliceIndexForTop(cache.set, top);
      if (index === null) break;
      const plate = cache.ground(index, groundCapM2);
      if (plate.areaM2 < minFloor) break;
      const need = budget(base.length * plate.areaM2, plate.areaM2);
      const specs = [
        ...base,
        ...Array.from({ length: count }, () => ({ use, heightM: useHeightM })),
      ];
      let z = 0;
      const floors = specs.map((spec): PlannedFloor => {
        const floor = { use: spec.use, z0M: z, heightM: spec.heightM, plate, sliceIndex: index };
        z = roundM(z + spec.heightM);
        return floor;
      });
      const held = Math.min(count * plate.areaM2, need);
      if (!best || held > best.held + 0.5) best = { floors, held };
      if (count * plate.areaM2 >= need) break;
    }
    return best?.floors ?? null;
  }

  return { grounds: ["lobby", "parking"], minPartialM2: minFloor, stack };
}
