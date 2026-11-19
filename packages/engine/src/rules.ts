/** Units every engine number is expressed in. Ratios are fractions: 4% is 0.04. */
export type Unit = "m" | "m2" | "ratio" | "spaces" | "rooms" | "floors";

export const RULE_IDS = [
  "far.max",
  "far.bonus",
  "osr.min",
  "openSpace.min",
  "setback.road",
  "setback.boundary",
  "height.roadPlane",
  "highRise.threshold",
  "highRise.road",
  "highRise.frontage",
  "highRise.clearance",
  "highRise.farCeiling",
  "use.size",
  "parking.min",
] as const;

export type RuleId = (typeof RULE_IDS)[number];

export const RULE_INFO = {
  "far.max": { label: "Floor area ratio", unit: "ratio" },
  "far.bonus": { label: "Floor area ratio bonus", unit: "ratio" },
  "osr.min": { label: "Open space ratio", unit: "ratio" },
  "openSpace.min": { label: "Open ground on the plot", unit: "ratio" },
  "setback.road": { label: "Setback from the road", unit: "m" },
  "setback.boundary": { label: "Distance to neighbouring plots", unit: "m" },
  "height.roadPlane": { label: "Height limit from road width", unit: "m" },
  "highRise.threshold": { label: "High-rise threshold", unit: "m" },
  "highRise.road": { label: "Road width for a high-rise", unit: "m" },
  "highRise.frontage": { label: "Road frontage for a high-rise", unit: "m" },
  "highRise.clearance": { label: "High-rise clearance around the building", unit: "m" },
  "highRise.farCeiling": { label: "High-rise floor area ratio ceiling", unit: "ratio" },
  "use.size": { label: "Size allowed for this use", unit: "m2" },
  "parking.min": { label: "Parking spaces", unit: "spaces" },
} as const satisfies Record<RuleId, { label: string; unit: Unit }>;
