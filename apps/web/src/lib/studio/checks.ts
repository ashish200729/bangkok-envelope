import type { Check, CheckStatus, RuleId } from "@envelope/engine";

/** The studio controls a failing check is about, so the editor can mark them. */
export type CheckTarget =
  | "envelope"
  | "fit"
  | "tower"
  | "floors"
  | "gfa"
  | "parking"
  | "open"
  | "units";

const TARGETS: Partial<Record<RuleId, readonly CheckTarget[]>> = {
  "far.max": ["gfa", "floors"],
  "highRise.farCeiling": ["gfa", "floors"],
  "osr.min": ["open", "floors"],
  "openSpace.min": ["open", "tower"],
  "envelope.fit": ["fit", "tower", "floors"],
  "highRise.road": ["envelope"],
  "highRise.largeRoad": ["envelope", "gfa"],
  "highRise.frontage": ["envelope"],
  "highRise.clearance": ["envelope"],
  "use.size": ["floors"],
  "use.rooms": ["floors", "units"],
  "parking.min": ["parking", "floors"],
};

export function failingTargets(checks: readonly Check[]): Map<CheckTarget, Check[]> {
  const targets = new Map<CheckTarget, Check[]>();
  for (const check of checks) {
    if (check.status !== "fail") continue;
    for (const target of TARGETS[check.ruleId] ?? []) {
      targets.set(target, [...(targets.get(target) ?? []), check]);
    }
  }
  return targets;
}

/** A check whose status changed with the last edit. */
export type CheckChange = { check: Check; from: CheckStatus | "new"; to: CheckStatus };

/** Rule ids repeat (one per road, a second envelope check), so the nth of each id is matched. */
function keyed(checks: readonly Check[]): Map<string, Check> {
  const seen = new Map<RuleId, number>();
  const out = new Map<string, Check>();
  for (const check of checks) {
    const n = seen.get(check.ruleId) ?? 0;
    seen.set(check.ruleId, n + 1);
    out.set(`${check.ruleId}#${n}`, check);
  }
  return out;
}

/** Checks that flipped between two builds; a check that disappeared is not reported. */
export function checkChanges(before: readonly Check[], after: readonly Check[]): CheckChange[] {
  const old = keyed(before);
  const changes: CheckChange[] = [];
  for (const [key, check] of keyed(after)) {
    const was = old.get(key);
    if (!was) {
      if (check.status === "fail") changes.push({ check, from: "new", to: check.status });
    } else if (was.status !== check.status) {
      changes.push({ check, from: was.status, to: check.status });
    }
  }
  return changes;
}
