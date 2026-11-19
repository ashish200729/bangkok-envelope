import {
  ALL_RULES_ON,
  type AppliedRule,
  type Check,
  type EngineInput,
  type EngineSuccess,
  evaluate,
  type Polygon,
  SAMPLE_INPUT,
} from "@envelope/engine";
import { describe, expect, it } from "vitest";
import { handleRequest } from "@/lib/engine/handle";
import { outlinePolygons, scheduleAreasM2, sumFloorAreas } from "./designs";
import { fixtureDesigns } from "./fixtures";
import { floorLabel, formatCheckFigures, formatRuleValue } from "./format";
import { groupRules, RULE_GROUPS } from "./rule-groups";
import { summarise } from "./summary";
import { shownEnvelope } from "./view";

function run(input: EngineInput = SAMPLE_INPUT): EngineSuccess {
  const result = evaluate(input);
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

const withRoad = (widthM: number): EngineInput => ({
  ...SAMPLE_INPUT,
  roads: [{ ...SAMPLE_INPUT.roads[0], widthM }],
});

const rule = (over: Partial<AppliedRule>): AppliedRule => ({
  id: "far.max",
  label: "Floor area ratio",
  value: 8,
  unit: "ratio",
  source: { law: "bkk-plan-2556", clause: "17" },
  affectsEnvelope: false,
  enabled: true,
  ...over,
});

describe("formatting", () => {
  it("shows floor area ratios as multiples and shares as percentages", () => {
    expect(formatRuleValue(rule({ id: "far.max", value: 8 }))).toBe("8×");
    expect(formatRuleValue(rule({ id: "far.bonus", value: 1.6 }))).toBe("+1.6×");
    expect(formatRuleValue(rule({ id: "far.bonus", value: 0 }))).toBe("None");
    expect(formatRuleValue(rule({ id: "osr.min", value: 0.045 }))).toBe("4.5%");
    expect(formatRuleValue(rule({ id: "openSpace.min", value: 0.3 }))).toBe("30%");
  });

  it("shows lengths, areas and missing limits plainly", () => {
    expect(formatRuleValue(rule({ id: "setback.road", unit: "m", value: 1 }))).toBe("1 m");
    expect(formatRuleValue(rule({ id: "setback.road", unit: "m", value: 1.25 }))).toBe("1.3 m");
    expect(formatRuleValue(rule({ id: "use.size", unit: "m2", value: 10000 }))).toBe("10,000 m²");
    expect(formatRuleValue(rule({ id: "use.size", unit: "m2", value: null }))).toBe("No cap");
    expect(formatRuleValue(rule({ id: "parking.min", unit: "spaces", value: null }))).toBe(
      "Per design",
    );
  });

  it("labels floors the way the tooltip reads, ground floor as floor 1", () => {
    expect(floorLabel({ level: 6, use: "residential", areaM2: 1120.4 })).toBe(
      "Floor 7 · Residential · 1,120 m²",
    );
  });

  it("formats a check's figures as actual / limit", () => {
    const check: Check = {
      ruleId: "openSpace.min",
      label: "Open ground",
      status: "pass",
      actual: 0.364,
      limit: 0.3,
      unit: "ratio",
      source: { law: "mr-33", clause: "6" },
      message: "",
    };
    expect(formatCheckFigures(check)).toBe("36.4% / 30%");
    expect(formatCheckFigures({ ...check, limit: null })).toBe("36.4%");
  });
});

describe("groupRules", () => {
  const result = run();
  const groups = groupRules(result.rules, result.highRise.checks);

  it("keeps every rule once, in the panel's group order", () => {
    expect(groups.flatMap((g) => g.rows).length).toBe(result.rules.length);
    const order = RULE_GROUPS.map((g) => g.id);
    const ids = groups.map((g) => g.id);
    expect(ids).toEqual(order.filter((id) => ids.includes(id)));
  });

  it("gives repeated rule ids unique keys", () => {
    const keys = groups.flatMap((g) => g.rows.map((r) => r.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("shows each switch once, on the first row it governs", () => {
    const shown = groups
      .flatMap((g) => g.rows)
      .flatMap((r) => (r.toggle?.shown ? [r.toggle.key] : []));
    expect(shown.sort()).toEqual(Object.keys(ALL_RULES_ON).sort());
  });

  it("attaches the site's high-rise access checks to their rules", () => {
    const highRise = groups.find((g) => g.id === "high-rise");
    const road = highRise?.rows.find((r) => r.rule.id === "highRise.road");
    expect(road?.check?.status).toBe("pass");
  });
});

describe("summary", () => {
  it("caps a high-rise's floor area at 30,000 m² on a road under 18 m", () => {
    const big = run({ ...withRoad(12), farBonusPct: 20 });
    const summary = summarise({ ...withRoad(12), farBonusPct: 20 }, big, "highRise");
    expect(summary.maxFloorArea.far).toBeCloseTo(9.6);
    expect(summary.maxFloorArea.areaM2).toBeLessThanOrEqual(30000);
  });

  it("falls back to the low-rise envelope when a high-rise is not allowed", () => {
    const narrow = run(withRoad(8));
    expect(narrow.envelopes.highRise).toBeNull();
    expect(shownEnvelope(narrow, "highRise").kind).toBe("lowRise");
    expect(summarise(withRoad(8), narrow, "highRise").maxHeightM).toBe(23);
  });

  it("says what sets the height, and never calls an applied height plane switched off", () => {
    const wide = withRoad(200);
    const summary = summarise(wide, run(wide), "highRise");
    expect(summary.maxHeightM).toBeNull();
    expect(summary.heightBy).toBe("plane-not-binding");
    const off = { ...wide, toggles: { ...ALL_RULES_ON, roadHeightPlane: false } };
    expect(summarise(off, run(off), "highRise").heightBy).toBe("plane-off");
    expect(summarise(SAMPLE_INPUT, run(), "highRise").heightBy).toBe("road-plane");
    expect(summarise(SAMPLE_INPUT, run(), "lowRise").heightBy).toBe("low-rise");
  });

  it("shows a wider road as a taller allowed space", () => {
    const at = (w: number) => summarise(withRoad(w), run(withRoad(w)), "highRise").maxHeightM;
    expect(at(20) ?? 0).toBeGreaterThan(at(10) ?? 0);
  });
});

describe("designs", () => {
  it("reads a floor outline as one polygon or several", () => {
    const ring = [
      [100, 13],
      [100.001, 13],
      [100.001, 13.001],
      [100, 13],
    ] as const;
    const polygon: Polygon = [ring];
    expect(outlinePolygons(polygon)).toEqual([polygon]);
    expect(outlinePolygons([polygon, polygon])).toEqual([polygon, polygon]);
  });

  it("schedules add up to the stated floor area, for the engine's designs and the fixtures", () => {
    const result = run();
    const designs = [...result.designs, ...fixtureDesigns(result, SAMPLE_INPUT)];
    expect(designs.length).toBeGreaterThanOrEqual(4);
    for (const design of designs) {
      expect(sumFloorAreas(design)).toBeCloseTo(design.gfaM2, 6);
    }
  });

  it("shows whole-m² floor areas that add up to the total the schedule shows", () => {
    const designs = [
      ...run().designs,
      ...run({ ...withRoad(20), buildingType: "hotel" }).designs,
      ...run({ ...SAMPLE_INPUT, buildingType: "office", farBonusPct: 20 }).designs,
    ];
    const naiveMismatch = designs.some(
      (d) => d.floors.reduce((s, f) => s + Math.round(f.areaM2), 0) !== Math.round(d.gfaM2),
    );
    expect(naiveMismatch).toBe(true);
    for (const design of designs) {
      const areas = scheduleAreasM2(design);
      expect(areas.reduce((s, a) => s + a, 0)).toBe(Math.round(design.gfaM2));
      areas.forEach((area, i) => {
        expect(Math.abs(area - (design.floors[i]?.areaM2 ?? 0))).toBeLessThan(1);
      });
    }
  });

  it("fixture designs follow the building type", () => {
    const result = run({ ...SAMPLE_INPUT, buildingType: "hotel" });
    const uses = fixtureDesigns(result, { ...SAMPLE_INPUT, buildingType: "hotel" }).flatMap((d) =>
      d.floors.map((f) => f.use),
    );
    expect(uses).toContain("hotel");
    expect(uses).not.toContain("residential");
  });
});

describe("worker boundary", () => {
  it("refuses input that fails the schema, with the problems", () => {
    const reply = handleRequest({ ...SAMPLE_INPUT, farBonusPct: 50 });
    expect(reply.kind).toBe("invalid");
  });

  it("evaluates valid input", () => {
    const reply = handleRequest(SAMPLE_INPUT);
    expect(reply.kind === "result" && reply.result.ok).toBe(true);
  });
});
