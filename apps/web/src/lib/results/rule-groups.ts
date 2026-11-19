import type { AppliedRule, Check, RuleId, RuleToggles } from "@envelope/engine";

export const RULE_GROUPS = [
  { id: "floor-area", title: "Floor area" },
  { id: "open-space", title: "Open space" },
  { id: "setbacks", title: "Setbacks and distances" },
  { id: "height", title: "Height" },
  { id: "high-rise", title: "High-rise access" },
  { id: "use", title: "Use limits" },
  { id: "parking", title: "Parking" },
] as const;

export type RuleGroupId = (typeof RULE_GROUPS)[number]["id"];

const GROUP_OF: Record<RuleId, RuleGroupId> = {
  "far.max": "floor-area",
  "far.bonus": "floor-area",
  "osr.min": "open-space",
  "openSpace.min": "open-space",
  "setback.road": "setbacks",
  "setback.boundary": "setbacks",
  "height.roadPlane": "height",
  "highRise.threshold": "height",
  "highRise.road": "high-rise",
  "highRise.frontage": "high-rise",
  "highRise.largeRoad": "high-rise",
  "highRise.clearance": "high-rise",
  "highRise.farCeiling": "high-rise",
  "use.size": "use",
  "use.rooms": "use",
  "parking.min": "parking",
};

export type ToggleKey = keyof RuleToggles;

export const TOGGLE_OF: Partial<Record<RuleId, ToggleKey>> = {
  "setback.road": "roadSetback",
  "setback.boundary": "boundarySetback",
  "height.roadPlane": "roadHeightPlane",
  "highRise.road": "highRiseGate",
  "highRise.frontage": "highRiseGate",
  "highRise.largeRoad": "highRiseGate",
  "osr.min": "openSpace",
  "openSpace.min": "openSpace",
};

export const TOGGLE_LABEL: Record<ToggleKey, string> = {
  roadSetback: "Road setback",
  boundarySetback: "Distance to neighbours",
  roadHeightPlane: "Height limit from road width",
  highRiseGate: "High-rise site access",
  openSpace: "Open space checks",
};

export type RuleRow = {
  /** Rule ids repeat (once per road), so rows are keyed by position too. */
  key: string;
  rule: AppliedRule;
  /** The switch is shown once, on the first row it governs. */
  toggle: { key: ToggleKey; shown: boolean } | null;
  check: Check | null;
};

export type RuleGroup = { id: RuleGroupId; title: string; rows: RuleRow[] };

/** Rules in the panel's groups, in display order; empty groups are left out. */
export function groupRules(
  rules: readonly AppliedRule[],
  highRiseChecks: readonly Check[],
): RuleGroup[] {
  const seenToggles = new Set<ToggleKey>();
  const checks = new Map(highRiseChecks.map((check) => [check.ruleId, check]));
  const rows = rules.map((rule, index): RuleRow => {
    const key = TOGGLE_OF[rule.id];
    const toggle = key ? { key, shown: !seenToggles.has(key) } : null;
    if (key) seenToggles.add(key);
    return { key: `${index}-${rule.id}`, rule, toggle, check: checks.get(rule.id) ?? null };
  });
  return RULE_GROUPS.map((group) => ({
    ...group,
    rows: rows.filter((row) => GROUP_OF[row.rule.id] === group.id),
  })).filter((group) => group.rows.length > 0);
}
