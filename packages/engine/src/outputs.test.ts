import { describe, expect, it } from "vitest";
import { SAMPLE_INPUT } from "./fixtures";
import { closeRing } from "./geo";
import type { Check, CheckStatus, EngineResult, Evaluate } from "./outputs";
import { RULE_IDS, RULE_INFO } from "./rules";
import { ENGINE_VERSION } from "./version";

const ring = closeRing(SAMPLE_INPUT.plot.vertices);

const roadCheck: Check = {
  ruleId: "highRise.road",
  label: RULE_INFO["highRise.road"].label,
  status: "fail",
  actual: 8,
  limit: 10,
  unit: "m",
  source: { law: "mr-33", clause: "2" },
  message: "Road is 8 m; a high-rise needs at least 10 m",
};

const stubEvaluate: Evaluate = (input) =>
  input.plot.edges.some((edge) => edge.kind === "road")
    ? {
        ok: true,
        version: ENGINE_VERSION,
        plotAreaM2: 5600,
        rules: [],
        envelopes: {
          lowRise: {
            slices: [{ z0M: 0, z1M: 1, footprint: [[ring]], areaM2: 3900 }],
            maxHeightM: 1,
            groundAreaM2: 3900,
          },
          highRise: null,
        },
        highRise: { allowed: false, checks: [roadCheck], maxGfaM2: null },
        designs: [],
      }
    : {
        ok: false,
        version: ENGINE_VERSION,
        error: { code: "no-road-edge", message: "No edge faces a public road" },
      };

function badgeFor(status: CheckStatus): string {
  switch (status) {
    case "pass":
      return "Pass";
    case "fail":
      return "Fail";
    case "warn":
      return "Check";
    case "n/a":
      return "Not applicable";
  }
}

describe("engine result contract", () => {
  it("narrows on ok so consumers handle both outcomes", () => {
    const results: EngineResult[] = [
      stubEvaluate(SAMPLE_INPUT),
      stubEvaluate({
        ...SAMPLE_INPUT,
        plot: {
          ...SAMPLE_INPUT.plot,
          edges: SAMPLE_INPUT.plot.edges.map(() => ({ kind: "boundary" })),
        },
      }),
    ];
    const summary = results.map((r) =>
      r.ok ? r.highRise.checks.map((c) => badgeFor(c.status)) : r.error.code,
    );
    expect(summary).toEqual([["Fail"], "no-road-edge"]);
  });

  it("has a label and unit for every rule id", () => {
    for (const id of RULE_IDS) {
      expect(RULE_INFO[id].label.length).toBeGreaterThan(0);
    }
  });
});
