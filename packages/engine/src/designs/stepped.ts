import type { FloorUse } from "../outputs";
import { DESIGN_ASSUMPTIONS } from "./assumptions";
import { type PlateCache, type Scheme, steppedStack } from "./stack";

/** Every floor as large as its own height band allows, so the massing steps back with the envelope. */
export function steppedScheme(cache: PlateCache, use: FloorUse, useHeightM: number): Scheme {
  const minFloor = DESIGN_ASSUMPTIONS.minFloorM2.value;
  return {
    grounds: ["lobby", "parking"],
    minPartialM2: minFloor,
    stack: (program, groundCapM2, budget) =>
      steppedStack({ cache, program, use, useHeightM, groundCapM2, budget, minPlateM2: minFloor }),
  };
}
