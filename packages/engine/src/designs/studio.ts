import type { EngineInput } from "../inputs";
import type { FloorUse } from "../outputs";
import type { DesignSpec, FloorSpec, TowerSpec } from "../spec";
import { DESIGN_ASSUMPTIONS, USE_FLOOR_HEIGHT_M } from "./assumptions";
import { floorList } from "./checks";
import { siteFor } from "./custom";
import { roadDirection, siteAnchor, towerSpecAt } from "./tower";

export const USE_LABEL = {
  lobby: "Lobby",
  parking: "Parking",
  retail: "Retail",
  amenity: "Amenity",
  residential: "Residential",
  office: "Office",
  hotel: "Hotel",
} as const satisfies Record<FloorUse, string>;

/** A new floor of a use: its typical height, cut like the floor below it (or the envelope). */
export function defaultFloorSpec(use: FloorUse, below?: FloorSpec): FloorSpec {
  return {
    use,
    heightM: USE_FLOOR_HEIGHT_M[use],
    plate: below?.plate ?? "envelope",
    insetM: below?.insetM ?? 0,
  };
}

/**
 * A tower for a design that has none: the building type's typical plate, half as long again as
 * deep, along the longest road, centred on the site's anchor. Null when the plot cannot be analysed.
 */
export function defaultTowerSpec(input: EngineInput): TowerSpec | null {
  const analysis = siteFor(input);
  if (!analysis.ok) return null;
  const { site } = analysis;
  const area = DESIGN_ASSUMPTIONS.towerPlateM2.value[input.buildingType];
  const length = Math.sqrt(area * 1.5);
  const anchor = siteAnchor(site.lowRise);
  return towerSpecAt(anchor, anchor, roadDirection(site), length, area / length);
}

const num = (n: number) => String(Math.round(n * 100) / 100);
const ENVELOPE_NAME = { lowRise: "low-rise", highRise: "high-rise" } as const;

function floorChange(a: FloorSpec, b: FloorSpec): string | null {
  if (a.use !== b.use) return `${USE_LABEL[a.use]} → ${USE_LABEL[b.use]}`;
  if (a.heightM !== b.heightM) return `height ${num(a.heightM)} → ${num(b.heightM)} m`;
  if (a.plate !== b.plate) return `${a.plate} plate → ${b.plate} plate`;
  if (a.insetM !== b.insetM) return `inset ${num(a.insetM)} → ${num(b.insetM)} m`;
  return null;
}

const same = (a: FloorSpec, b: FloorSpec) => floorChange(a, b) === null;

/** The one floor `longer` has that `shorter` lacks, when that is the only difference. */
function insertedAt(shorter: readonly FloorSpec[], longer: readonly FloorSpec[]): number | null {
  if (longer.length !== shorter.length + 1) return null;
  const i = shorter.findIndex((f, k) => !same(f, longer[k] as FloorSpec));
  const at = i < 0 ? shorter.length : i;
  return shorter.slice(at).every((f, k) => same(f, longer[at + k + 1] as FloorSpec)) ? at : null;
}

function floorsChange(prev: readonly FloorSpec[], next: readonly FloorSpec[]): string | null {
  const added = insertedAt(prev, next);
  if (added !== null) {
    const floor = next[added] as FloorSpec;
    return `Added floor ${added + 1} (${USE_LABEL[floor.use]})`;
  }
  const removed = insertedAt(next, prev);
  if (removed !== null) {
    const floor = prev[removed] as FloorSpec;
    return `Removed floor ${removed + 1} (${USE_LABEL[floor.use]})`;
  }
  if (prev.length !== next.length) return `Floors: ${prev.length} → ${next.length}`;
  const changes = prev
    .map((f, i) => ({ level: i, change: floorChange(f, next[i] as FloorSpec) }))
    .filter((c): c is { level: number; change: string } => c.change !== null);
  const first = changes[0];
  if (!first) return null;
  if (changes.every((c) => c.change === first.change)) {
    return `${floorList(changes.map((c) => c.level))}: ${first.change}`;
  }
  return `Changed ${changes.length} floors`;
}

function towerChange(prev: TowerSpec | null, next: TowerSpec | null): string | null {
  if (!prev && !next) return null;
  if (!prev) return "Added a tower";
  if (!next) return "Removed the tower";
  if (prev.widthM !== next.widthM || prev.depthM !== next.depthM) {
    return `Tower resized to ${num(next.widthM)} × ${num(next.depthM)} m`;
  }
  if (prev.rotationDeg !== next.rotationDeg) return `Tower turned to ${num(next.rotationDeg)}°`;
  if (prev.offsetM.x !== next.offsetM.x || prev.offsetM.y !== next.offsetM.y) {
    return "Tower moved";
  }
  return null;
}

/** A short plain sentence for the undo history, e.g. "Floor 8: Residential → Office". */
export function describeSpecChange(prev: DesignSpec, next: DesignSpec): string {
  const changes = [
    prev.name !== next.name ? `Renamed to "${next.name}"` : null,
    prev.envelope !== next.envelope
      ? `Envelope: ${ENVELOPE_NAME[prev.envelope]} → ${ENVELOPE_NAME[next.envelope]}`
      : null,
    prev.fitToEnvelope !== next.fitToEnvelope
      ? next.fitToEnvelope
        ? "Floors cut to the envelope again"
        : "Floors may leave the envelope"
      : null,
    prev.straight !== next.straight
      ? next.straight
        ? "Straight walls on"
        : "Straight walls off"
      : null,
    prev.unitSizeM2 !== next.unitSizeM2
      ? `Unit size: ${num(prev.unitSizeM2)} → ${num(next.unitSizeM2)} m²`
      : null,
    towerChange(prev.tower, next.tower),
    floorsChange(prev.floors, next.floors),
  ].filter((c): c is string => c !== null);
  const [first, second] = changes;
  if (!first) return "No change";
  if (changes.length === 1) return first;
  if (changes.length === 2) return `${first}; ${second}`;
  return `${first}; and ${changes.length - 1} more changes`;
}
