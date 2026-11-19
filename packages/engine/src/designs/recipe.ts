import type { BuildingType } from "../inputs";
import type { EnvelopeKind } from "../setbacks";
import { type DesignSpec, type FloorSpec, MAX_INSET_M } from "../spec";
import { defaultUnitSizeM2 } from "./assumptions";
import { insetToArea, largestPiece, type Plate } from "./plates";
import { type PlannedFloor, type SliceSet, sliceIndexForTop } from "./stack";

const AREA_EPS_M2 = 1e-6;

/**
 * Insets that rebuild a straight block's floors from the region at its actual top. A block's
 * plates come from the top it was planned for; when the optimiser later drops floors, the
 * actual top can sit in a lower (larger) slice, so each floor's inset is found again by area.
 */
function straightInsets(set: SliceSet, floors: readonly PlannedFloor[]): number[] | null {
  const last = floors[floors.length - 1];
  if (!last) return null;
  const index = sliceIndexForTop(set, last.z0M + last.heightM);
  if (index === null || floors.every((f) => f.sliceIndex === index || f.sliceIndex === -1)) {
    return null;
  }
  const piece = largestPiece(set.slices[index]?.region.paths ?? []);
  const insets: number[] = [];
  let below: Plate | null = null;
  let from = 0;
  for (const floor of floors) {
    const fitted = insetToArea(piece, floor.plate.areaM2 + AREA_EPS_M2, below, from);
    insets.push(fitted.insetM);
    below = fitted.plate;
    from = fitted.insetM;
  }
  return insets;
}

/** The editable recipe of a generated design: the cuts it was built with, floor by floor. */
export function specOf(options: {
  name: string;
  envelope: EnvelopeKind;
  set: SliceSet;
  straight: boolean;
  floors: readonly PlannedFloor[];
  buildingType: BuildingType;
}): DesignSpec {
  const { floors } = options;
  const insets = options.straight ? straightInsets(options.set, floors) : null;
  return {
    name: options.name,
    envelope: options.envelope,
    fitToEnvelope: true,
    straight: options.straight,
    floors: floors.map(
      (f, i): FloorSpec => ({
        use: f.use,
        heightM: f.heightM,
        plate: f.recipe.plate,
        insetM: Math.min(MAX_INSET_M, insets?.[i] ?? f.recipe.insetM),
      }),
    ),
    tower: floors.find((f) => f.tower)?.tower ?? null,
    unitSizeM2: defaultUnitSizeM2(options.buildingType),
  };
}
