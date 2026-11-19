import type { AppliedRule, Check, FloorUse, RuleId, Unit } from "@envelope/engine";

const formatters = new Map<number, Intl.NumberFormat>();
function fmt(value: number, maxDecimals: number): string {
  let f = formatters.get(maxDecimals);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { maximumFractionDigits: maxDecimals });
    formatters.set(maxDecimals, f);
  }
  const out = f.format(value);
  return out === "-0" ? "0" : out;
}

export const formatInt = (n: number) => fmt(Math.round(n), 0);
export const formatArea = (m2: number) => `${fmt(m2, 0)} m²`;
/** Lengths to one decimal at most, trailing zeros dropped: 6 m, 1.2 m. */
export const formatLength = (m: number) => `${fmt(m, 1)} m`;
export const formatPercent = (fraction: number) => `${fmt(fraction * 100, 1)}%`;
export const formatNumber = (n: number, maxDecimals = 2) => fmt(n, maxDecimals);
/** Floor area ratio, e.g. 8× or 9.6×. */
export const formatFar = (ratio: number) => `${fmt(ratio, 2)}×`;

/** Rules whose ratio is a floor area multiple rather than a share. */
const FAR_RULES: ReadonlySet<RuleId> = new Set(["far.max", "far.bonus", "highRise.farCeiling"]);

export function formatValue(ruleId: RuleId, unit: Unit, value: number): string {
  switch (unit) {
    case "ratio":
      return FAR_RULES.has(ruleId) ? formatFar(value) : formatPercent(value);
    case "m":
      return formatLength(value);
    case "m2":
      return formatArea(value);
    case "spaces":
      return `${formatInt(value)} ${value === 1 ? "space" : "spaces"}`;
    case "rooms":
      return `${formatInt(value)} ${value === 1 ? "room" : "rooms"}`;
    case "floors":
      return `${formatInt(value)} ${value === 1 ? "floor" : "floors"}`;
  }
}

/** What a rules-panel row shows as its value. */
export function formatRuleValue(rule: AppliedRule): string {
  if (rule.value === null) return rule.id === "parking.min" ? "Per design" : "No cap";
  if (rule.id === "far.bonus") return rule.value > 0 ? `+${formatFar(rule.value)}` : "None";
  return formatValue(rule.id, rule.unit, rule.value);
}

/** "62% of 70%" style figures for a checklist line; null when the check has no numbers. */
export function formatCheckFigures(check: Check): string | null {
  const actual = check.actual === null ? null : formatValue(check.ruleId, check.unit, check.actual);
  const limit = check.limit === null ? null : formatValue(check.ruleId, check.unit, check.limit);
  if (actual && limit) return `${actual} / ${limit}`;
  return actual ?? limit;
}

export const FLOOR_USE_LABEL: Record<FloorUse, string> = {
  parking: "Parking",
  lobby: "Lobby",
  retail: "Retail",
  amenity: "Amenity",
  residential: "Residential",
  office: "Office",
  hotel: "Hotel",
};

/** Ground floor is floor 1, as on Thai drawings. */
export const floorNumber = (level: number) => level + 1;

/** "Floor 7 · Residential · 1,120 m²" */
export function floorLabel(floor: { level: number; use: FloorUse; areaM2: number }): string {
  return `Floor ${floorNumber(floor.level)} · ${FLOOR_USE_LABEL[floor.use]} · ${formatArea(floor.areaM2)}`;
}

/** "0–32 m" */
export const formatBand = (z0: number, z1: number) => `${fmt(z0, 1)}–${fmt(z1, 1)} m`;
