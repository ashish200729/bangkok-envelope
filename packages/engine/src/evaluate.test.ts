import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate";
import { SAMPLE_INPUT } from "./fixtures";
import { ALL_RULES_ON, type EngineInput, type RuleToggles } from "./inputs";
import { formatCitation } from "./law";
import type { EngineSuccess, Envelope } from "./outputs";
import { distanceToSegment, signedArea } from "./plot";
import type { XY } from "./projection";
import {
  areaAt,
  footprintPoints,
  plotInput,
  rect,
  type Side,
  seededRandom,
  success,
  testProjection,
} from "./test-support";

/** Clipper rounds intersections to 0.1 mm; distances must hold to within 2 mm. */
const TOLERANCE_M = 0.002;

const rectOn12 = () => plotInput(rect(40, 50), [12, "boundary", "boundary", "boundary"]);

function withToggles(input: EngineInput, toggles: Partial<RuleToggles>): EngineInput {
  return { ...input, toggles: { ...ALL_RULES_ON, ...toggles } };
}

function segmentDistance(a: XY, b: XY, c: XY, d: XY): number {
  const cross = (o: XY, p: XY, q: XY) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const crosses = cross(c, d, a) * cross(c, d, b) < 0 && cross(a, b, c) * cross(a, b, d) < 0;
  if (crosses) return 0;
  return Math.min(
    distanceToSegment(a, c, d),
    distanceToSegment(b, c, d),
    distanceToSegment(c, a, b),
    distanceToSegment(d, a, b),
  );
}

/** Footprint edges of every slice, in the test's local metres. */
function sliceEdges(envelope: Envelope): { z1M: number; edges: [XY, XY][] }[] {
  return envelope.slices.map((slice) => ({
    z1M: slice.z1M,
    edges: slice.footprint.flatMap((polygon) =>
      polygon.flatMap((ring) => {
        const pts = ring.map((p) => testProjection.toLocal(p));
        return pts.slice(1).map((p, i): [XY, XY] => [pts[i] as XY, p]);
      }),
    ),
  }));
}

describe("40 × 50 m plot on a 12 m road (hand-checked)", () => {
  const result = success(evaluate(rectOn12()));
  const { lowRise, highRise } = result.envelopes;

  it("measures the plot", () => {
    expect(result.plotAreaM2).toBeCloseTo(2000, 1);
  });

  it("low-rise: 1.2 m from the road (12 ÷ 10), 2 m to neighbours up to 9 m, 3 m above", () => {
    expect(areaAt(lowRise, 5)).toBeCloseTo((40 - 2 * 2) * (50 - 1.2 - 2), 1); // 1684.8
    expect(areaAt(lowRise, 15)).toBeCloseTo((40 - 2 * 3) * (50 - 1.2 - 3), 1); // 1557.2
    expect(areaAt(lowRise, 30)).toBe(0);
    expect(lowRise.maxHeightM).toBe(23);
    expect(lowRise.slices.map((s) => [s.z0M, s.z1M])).toEqual([
      [0, 9],
      [9, 23],
    ]);
    expect(lowRise.groundAreaM2).toBeCloseTo(1684.8, 1);
  });

  it("high-rise: 6 m on every side from the ground up, then the road plane", () => {
    if (!highRise) throw new Error("expected a high-rise envelope");
    expect(areaAt(highRise, 0)).toBeCloseTo(28 * 38, 1); // 1064
    expect(areaAt(highRise, 5)).toBeCloseTo(28 * 38, 1);
    expect(areaAt(highRise, 15)).toBeCloseTo(28 * 38, 1);
    // band 30–31 m: plane reach 31 / 2 − 12 = 3.5 m, still inside the 6 m clearance
    expect(areaAt(highRise, 30)).toBeCloseTo(28 * 38, 1);
    // band 50–51 m: plane reach 51 / 2 − 12 = 13.5 m from the road
    expect(areaAt(highRise, 50)).toBeCloseTo(28 * (50 - 13.5 - 6), 1);
    // the plane reaches the back clearance (44 m) at 2 × (44 + 12) = 112 m
    expect(highRise.maxHeightM).toBe(111);
    expect(highRise.slices[0]).toMatchObject({ z0M: 0, z1M: 36 });
  });

  it("allows a high-rise, capped at 30,000 m² because the road is under 18 m", () => {
    expect(result.highRise.allowed).toBe(true);
    expect(result.highRise.maxGfaM2).toBe(30_000);
    const statuses = Object.fromEntries(result.highRise.checks.map((c) => [c.ruleId, c.status]));
    expect(statuses).toEqual({
      "highRise.road": "pass",
      "highRise.frontage": "pass",
      "highRise.largeRoad": "warn",
      "highRise.clearance": "pass",
    });
  });

  it("returns closed GeoJSON rings, outer counter-clockwise", () => {
    for (const slice of [...lowRise.slices, ...(highRise?.slices ?? [])]) {
      for (const polygon of slice.footprint) {
        const [outer, ...holes] = polygon;
        if (!outer) throw new Error("empty polygon");
        expect(outer.at(-1)).toEqual(outer[0]);
        const local = outer.slice(0, -1).map((p) => testProjection.toLocal(p));
        expect(signedArea(local)).toBeGreaterThan(0);
        for (const hole of holes) {
          expect(signedArea(hole.slice(0, -1).map((p) => testProjection.toLocal(p)))).toBeLessThan(
            0,
          );
        }
      }
    }
  });

  it("is plain JSON", () => {
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

describe("road width", () => {
  it("on a 6 m soi keeps 6 m from the centreline: 3 m from the property line", () => {
    const result = success(
      evaluate(plotInput(rect(40, 50), [6, "boundary", "boundary", "boundary"])),
    );
    const low = result.envelopes.lowRise;
    expect(areaAt(low, 0)).toBeCloseTo(36 * (50 - 3 - 2), 1);
    expect(areaAt(low, 15)).toBeCloseTo(34 * (50 - 3 - 3), 1);
    // band 20–21 m: the road plane reaches 21 / 2 − 6 = 4.5 m, past the 3 m setback
    expect(areaAt(low, 20)).toBeCloseTo(34 * (50 - 4.5 - 3), 1);
    expect(result.rules.find((r) => r.id === "setback.road")?.value).toBe(3);
  });

  it("on a 25 m road keeps 2 m, and a high-rise is not capped", () => {
    const result = success(
      evaluate(plotInput(rect(40, 50), [25, "boundary", "boundary", "boundary"])),
    );
    expect(areaAt(result.envelopes.lowRise, 0)).toBeCloseTo(36 * (50 - 2 - 2), 1);
    expect(areaAt(result.envelopes.highRise, 0)).toBeCloseTo(28 * 38, 1);
    expect(result.highRise.maxGfaM2).toBeNull();
    // the plane passes the 6 m clearance at 2 × (25 + 6) = 62 m
    expect(areaAt(result.envelopes.highRise, 61)).toBeCloseTo(28 * 38, 1);
    expect(areaAt(result.envelopes.highRise, 70)).toBeCloseTo(28 * (50 - (71 / 2 - 25) - 6), 1);
  });

  it("on an 8 m road allows no high-rise", () => {
    const result = success(
      evaluate(plotInput(rect(40, 50), [8, "boundary", "boundary", "boundary"])),
    );
    expect(result.envelopes.highRise).toBeNull();
    expect(result.highRise.allowed).toBe(false);
    const road = result.highRise.checks.find((c) => c.ruleId === "highRise.road");
    expect(road).toMatchObject({ status: "fail", actual: 8, limit: 10 });
    expect(result.envelopes.lowRise.maxHeightM).toBe(23);
  });
});

describe("concave L-shaped plot", () => {
  // reflex corner at (20, 20)
  const corners: [number, number][] = [
    [0, 0],
    [40, 0],
    [40, 20],
    [20, 20],
    [20, 40],
    [0, 40],
  ];
  const sides: Side[] = [12, "boundary", "boundary", "boundary", "boundary", "boundary"];
  const result = success(evaluate(plotInput(corners, sides)));
  const plotEdges = corners.map((c, i): [XY, XY] => {
    const next = corners[(i + 1) % corners.length] as [number, number];
    return [
      { x: c[0], y: c[1] },
      { x: next[0], y: next[1] },
    ];
  });

  const expected = (kind: "low" | "high", side: Side, z: number) => {
    if (side === "boundary") return kind === "high" ? 6 : z <= 9 ? 2 : 3;
    const setback = side / 10;
    return Math.max(kind === "high" ? Math.max(setback, 6) : setback, z / 2 - side);
  };

  it.each([
    ["low", () => result.envelopes.lowRise],
    ["high", () => result.envelopes.highRise],
  ] as const)(
    "keeps every %s-rise footprint edge its distance from every plot side",
    (kind, get) => {
      const envelope = get();
      if (!envelope) throw new Error("expected an envelope");
      for (const slice of sliceEdges(envelope)) {
        for (const [i, [a, b]] of plotEdges.entries()) {
          const d = expected(kind, sides[i] as Side, slice.z1M);
          for (const [c, e] of slice.edges) {
            expect(segmentDistance(a, b, c, e)).toBeGreaterThanOrEqual(d - TOLERANCE_M);
          }
        }
      }
    },
  );

  it("rounds the cut around the reflex corner instead of over-cutting it", () => {
    const corner = { x: 20, y: 20 };
    const ground = sliceEdges(result.envelopes.lowRise)[0];
    if (!ground) throw new Error("no ground slice");
    const nearest = Math.min(...ground.edges.map(([a, b]) => distanceToSegment(corner, a, b)));
    expect(nearest).toBeGreaterThanOrEqual(2 - TOLERANCE_M);
    expect(nearest).toBeLessThan(2 + 0.05);
  });

  it("matches the hand-computed ground area", () => {
    const lowerArm = (40 - 2 - 2) * (20 - 1.2 - 2); // x 2..38, y 1.2..18
    const upperArm = (20 - 2 - 2) * (40 - 2 - 18); // x 2..18, y 18..38
    // The square x, y in 18..20 is 2 m from both inner sides only outside the radius-2
    // quarter disc around the reflex corner.
    const cornerPiece = 2 * 2 - Math.PI;
    expect(areaAt(result.envelopes.lowRise, 0)).toBeCloseTo(lowerArm + upperArm + cornerPiece, 1);
  });
});

describe("other shapes", () => {
  it("cannot fit a high-rise on a 12 m wide plot, even with a long frontage-qualified road", () => {
    const result = success(
      evaluate(plotInput(rect(12, 150), [30, "boundary", "boundary", "boundary"])),
    );
    expect(result.envelopes.highRise).toBeNull();
    expect(result.highRise.allowed).toBe(false);
    const statuses = Object.fromEntries(result.highRise.checks.map((c) => [c.ruleId, c.status]));
    expect(statuses).toMatchObject({
      "highRise.road": "pass",
      "highRise.frontage": "pass",
      "highRise.clearance": "fail",
    });
    expect(areaAt(result.envelopes.lowRise, 0)).toBeCloseTo(8 * (150 - 2 - 2), 1);

    const ungated = success(
      evaluate(
        withToggles(plotInput(rect(12, 150), [30, "boundary", "boundary", "boundary"]), {
          highRiseGate: false,
        }),
      ),
    );
    expect(ungated.envelopes.highRise).toBeNull();
  });

  it("insets a right triangle side by side", () => {
    const result = success(
      evaluate(
        plotInput(
          [
            [0, 0],
            [60, 0],
            [0, 50],
          ],
          [16, "boundary", "boundary"],
        ),
      ),
    );
    // y ≥ 1.6 (16 m road), x ≥ 2, and 2 m inside the hypotenuse 50x + 60y = 3000.
    const shifted = 3000 - 2 * Math.hypot(50, 60);
    const xEnd = (shifted - 60 * 1.6) / 50;
    const yEnd = (shifted - 50 * 2) / 60;
    expect(areaAt(result.envelopes.lowRise, 0)).toBeCloseTo(((xEnd - 2) * (yEnd - 1.6)) / 2, 1);
  });

  it("applies both roads on a corner plot", () => {
    const result = success(evaluate(plotInput(rect(40, 50), [12, 30, "boundary", "boundary"])));
    // 1.2 m from the 12 m road, 2 m from the 30 m road and the neighbours.
    expect(areaAt(result.envelopes.lowRise, 0)).toBeCloseTo(36 * 46.8, 1);
    // band 70–71 m: the 12 m road's plane reaches 23.5 m; the 30 m road's 5.5 m stays inside 6 m.
    expect(areaAt(result.envelopes.highRise, 70)).toBeCloseTo(28 * (50 - 23.5 - 6), 1);
    expect(result.highRise.maxGfaM2).toBeNull();
    expect(result.rules.filter((r) => r.id === "setback.road").map((r) => r.value)).toEqual([
      1.2, 2,
    ]);
    expect(result.rules.filter((r) => r.id === "height.roadPlane").map((r) => r.value)).toEqual([
      24, 60,
    ]);
  });

  it("gives the same envelope whichever way the plot is drawn", () => {
    const forward = success(evaluate(rectOn12()));
    const reversedCorners = [...rect(40, 50)].reverse();
    // reversed, the road side (0,0)→(40,0) becomes the side from corner 2 to corner 3
    const reversed = success(
      evaluate(plotInput(reversedCorners, ["boundary", "boundary", 12, "boundary"])),
    );
    expect(reversed.envelopes.lowRise.slices.map((s) => s.areaM2)).toEqual(
      forward.envelopes.lowRise.slices.map((s) => s.areaM2).map((a) => expect.closeTo(a, 3)),
    );
    expect(reversed.envelopes.highRise?.maxHeightM).toBe(forward.envelopes.highRise?.maxHeightM);
  });

  it("ignores repeated corners", () => {
    const corners = rect(40, 50);
    const doubled = [corners[0], corners[1], corners[1], corners[2], corners[3]] as [
      number,
      number,
    ][];
    const result = success(
      evaluate(plotInput(doubled, [12, "boundary", "boundary", "boundary", "boundary"])),
    );
    expect(areaAt(result.envelopes.lowRise, 0)).toBeCloseTo(1684.8, 1);
  });

  it("evaluates the sample plot", () => {
    const result = success(evaluate(SAMPLE_INPUT));
    expect(result.plotAreaM2).toBeGreaterThan(3000);
    expect(result.envelopes.highRise).not.toBeNull();
  });
});

describe("plots the engine cannot use", () => {
  const code = (input: EngineInput) => {
    const result = evaluate(input);
    return result.ok ? "ok" : result.error.code;
  };

  it("needs a side facing a road", () => {
    expect(code(plotInput(rect(40, 50), ["boundary", "boundary", "boundary", "boundary"]))).toBe(
      "no-road-edge",
    );
  });

  it("rejects a bow-tie", () => {
    expect(
      code(
        plotInput(
          [
            [0, 0],
            [40, 50],
            [40, 0],
            [0, 50],
          ],
          [12, "boundary", "boundary", "boundary"],
        ),
      ),
    ).toBe("self-intersecting");
  });

  it("rejects a side that doubles back", () => {
    expect(
      code(
        plotInput(
          [
            [0, 0],
            [40, 0],
            [40, 50],
            [40, 20],
            [0, 50],
          ],
          [12, "boundary", "boundary", "boundary", "boundary"],
        ),
      ),
    ).toBe("self-intersecting");
  });

  it("rejects corners on one line and repeated corners", () => {
    expect(
      code(
        plotInput(
          [
            [0, 0],
            [20, 0],
            [40, 0],
          ],
          [12, "boundary", "boundary"],
        ),
      ),
    ).toBe("degenerate");
    expect(
      code(
        plotInput(
          [
            [0, 0],
            [0, 0],
            [10, 10],
          ],
          [12, "boundary", "boundary"],
        ),
      ),
    ).toBe("degenerate");
  });

  it("reports a plot too small to build on", () => {
    expect(code(plotInput(rect(4, 4), [6, "boundary", "boundary", "boundary"]))).toBe("too-small");
  });

  it("returns errors as values with a message", () => {
    const result = evaluate(plotInput(rect(4, 4), [6, "boundary", "boundary", "boundary"]));
    expect(result).toMatchObject({
      ok: false,
      error: { code: "too-small", message: expect.any(String) },
    });
  });
});

describe("rule toggles", () => {
  const base = success(evaluate(rectOn12()));
  const off = (toggles: Partial<RuleToggles>, input = rectOn12()) =>
    success(evaluate(withToggles(input, toggles)));

  it("road setback off: both envelopes reach the road", () => {
    const result = off({ roadSetback: false });
    expect(result.envelopes.lowRise.groundAreaM2).toBeCloseTo(36 * 48, 1);
    expect(result.envelopes.highRise?.groundAreaM2).toBeCloseTo(28 * 44, 1);
    expect(result.rules.find((r) => r.id === "setback.road")?.enabled).toBe(false);
  });

  it("boundary setback off: both envelopes reach the neighbours", () => {
    const result = off({ boundarySetback: false });
    expect(result.envelopes.lowRise.groundAreaM2).toBeCloseTo(40 * 48.8, 1);
    expect(result.envelopes.highRise?.groundAreaM2).toBeCloseTo(40 * 44, 1);
  });

  it("road height plane off: the high-rise rises to the computation ceiling", () => {
    expect(base.envelopes.highRise?.maxHeightM).toBe(111);
    const result = off({ roadHeightPlane: false });
    expect(result.envelopes.highRise?.maxHeightM).toBe(300);
    expect(result.envelopes.highRise?.slices).toHaveLength(1);
  });

  it("road height plane off: the low-rise on a 6 m soi keeps its full top", () => {
    const soi = plotInput(rect(40, 50), [6, "boundary", "boundary", "boundary"]);
    const on = success(evaluate(soi));
    const offResult = off({ roadHeightPlane: false }, soi);
    // band 22–23 m: the plane reaches 23 / 2 − 6 = 5.5 m instead of the 3 m setback
    expect(areaAt(on.envelopes.lowRise, 22)).toBeCloseTo(34 * (50 - 5.5 - 3), 1);
    expect(areaAt(offResult.envelopes.lowRise, 22)).toBeCloseTo(34 * (50 - 3 - 3), 1);
  });

  it("high-rise gate off: an 8 m road gets a high-rise envelope", () => {
    const narrow = plotInput(rect(40, 50), [8, "boundary", "boundary", "boundary"]);
    expect(success(evaluate(narrow)).envelopes.highRise).toBeNull();
    const result = off({ highRiseGate: false }, narrow);
    expect(result.highRise.allowed).toBe(true);
    expect(result.envelopes.highRise?.groundAreaM2).toBeCloseTo(28 * 38, 1);
    expect(result.highRise.checks.find((c) => c.ruleId === "highRise.road")?.status).toBe("fail");
  });

  it("open space off changes no geometry", () => {
    const result = off({ openSpace: false });
    expect(result.envelopes).toEqual(base.envelopes);
    expect(result.rules.find((r) => r.id === "openSpace.min")?.enabled).toBe(false);
  });
});

describe("rules", () => {
  it("lists every rule with a value, unit and source, in display order", () => {
    const result = success(evaluate(rectOn12()));
    expect(result.rules.map((r) => r.id)).toEqual([
      "far.max",
      "far.bonus",
      "osr.min",
      "openSpace.min",
      "setback.road",
      "setback.boundary",
      "setback.boundary",
      "height.roadPlane",
      "highRise.threshold",
      "highRise.road",
      "highRise.frontage",
      "highRise.largeRoad",
      "highRise.clearance",
      "highRise.farCeiling",
      "use.size",
      "parking.min",
    ]);
    for (const rule of result.rules) expect(formatCitation(rule.source)).toMatch(/cl\. \S/);
    const values = Object.fromEntries(result.rules.map((r) => [r.id, r.value]));
    expect(values).toMatchObject({
      "far.max": 8,
      "far.bonus": 0,
      "osr.min": 0.04,
      "openSpace.min": 0.3,
      "setback.road": 1.2,
      "height.roadPlane": 24,
      "highRise.threshold": 23,
      "highRise.clearance": 6,
      "highRise.farCeiling": 10,
      "use.size": null,
    });
  });

  it("adds the claimed FAR bonus", () => {
    const result = success(evaluate({ ...rectOn12(), zone: "Y8", farBonusPct: 20 }));
    expect(result.rules.find((r) => r.id === "far.bonus")?.value).toBeCloseTo(1.2);
  });

  it("caps an office in ย.8 by road width unless a station is near", () => {
    const office = { ...rectOn12(), zone: "Y8" as const, buildingType: "office" as const };
    const far = success(evaluate(office));
    expect(far.rules.find((r) => r.id === "use.size")?.value).toBe(2_000);
    const near = success(evaluate({ ...office, site: { stationDistanceM: 300 } }));
    // a station lifts the road conditions but not the 10,000 m² ceiling
    expect(near.rules.find((r) => r.id === "use.size")?.value).toBe(10_000);
  });

  it("caps hotel rooms", () => {
    const hotel = { ...rectOn12(), zone: "Y8" as const, buildingType: "hotel" as const };
    expect(success(evaluate(hotel)).rules.find((r) => r.id === "use.rooms")?.value).toBe(50);
  });
});

/** Expected cut distance for a side at height z, written from the law table, not the engine. */
function lawDistance(kind: "low" | "high", side: Side, z: number, toggles: RuleToggles): number {
  if (side === "boundary") {
    if (!toggles.boundarySetback) return 0;
    return kind === "high" ? 6 : z <= 9 ? 2 : 3;
  }
  const setback = side < 10 ? Math.max(0, 6 - side / 2) : side <= 20 ? side / 10 : 2;
  const road = toggles.roadSetback ? (kind === "high" ? Math.max(setback, 6) : setback) : 0;
  const plane = toggles.roadHeightPlane ? z / 2 - side : 0;
  return Math.max(0, road, plane);
}

function insidePolygon(p: XY, ring: readonly XY[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i] as XY;
    const b = ring[j] as XY;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Every broken invariant as a sentence; empty when the result is sound. */
function violations(
  result: EngineSuccess,
  corners: readonly [number, number][],
  sides: readonly Side[],
  toggles: RuleToggles,
): string[] {
  const found: string[] = [];
  const fail = (message: string) => found.length < 5 && found.push(message);
  const ring = corners.map(([x, y]) => ({ x, y }));
  const edges = ring.map((a, i): [XY, XY] => [a, ring[(i + 1) % ring.length] as XY]);
  const { lowRise, highRise } = result.envelopes;
  if ((highRise === null) !== !result.highRise.allowed) fail("highRise null ⇔ not allowed");
  if (lowRise.maxHeightM > 23) fail("low-rise above 23 m");
  if (lowRise.groundAreaM2 > result.plotAreaM2 + 1e-6) fail("ground area exceeds the plot");
  if (highRise && highRise.maxHeightM < 23) fail("high-rise envelope below 23 m");

  for (const [kind, envelope] of [
    ["low", lowRise],
    ["high", highRise],
  ] as const) {
    if (!envelope) continue;
    if (envelope.slices[0]?.z0M !== 0) fail(`${kind}: does not start at the ground`);
    const points = footprintPoints(envelope);
    envelope.slices.forEach((slice, s) => {
      const next = envelope.slices[s + 1];
      if (next && next.z0M !== slice.z1M) fail(`${kind}: gap at ${slice.z1M} m`);
      if (next && next.areaM2 > slice.areaM2 + 1e-6) fail(`${kind}: grows at ${slice.z1M} m`);
      if (slice.areaM2 < 1) fail(`${kind}: slice under 1 m² at ${slice.z0M} m`);
      for (const p of points[s] ?? []) {
        const onBoundary = edges.some(([a, b]) => distanceToSegment(p, a, b) < TOLERANCE_M);
        if (!onBoundary && !insidePolygon(p, ring)) fail(`${kind}: point outside the plot`);
        edges.forEach(([a, b], i) => {
          const need = lawDistance(kind, sides[i] as Side, slice.z1M, toggles);
          const got = distanceToSegment(p, a, b);
          if (got < need - TOLERANCE_M)
            fail(`${kind} ${slice.z0M}–${slice.z1M} m: side ${i} at ${got}, needs ${need}`);
        });
      }
    });
  }
  if (highRise) {
    for (const z of [0, 5, 10, 22]) {
      if (areaAt(highRise, z) > areaAt(lowRise, z) + 1e-6)
        fail(`high-rise wider than low-rise at ${z} m`);
    }
  }
  return found;
}

describe("random plots (property test)", () => {
  it("keeps every invariant on 200 random simple polygons", () => {
    const random = seededRandom(20261119);
    const toggleKeys = [
      "roadSetback",
      "boundarySetback",
      "roadHeightPlane",
      "highRiseGate",
    ] as const;
    let successes = 0;
    for (let n = 0; n < 200; n++) {
      const count = 3 + Math.floor(random() * 10);
      const angles = Array.from({ length: count }, () => random() * 2 * Math.PI).sort(
        (a, b) => a - b,
      );
      const corners = angles.map((t): [number, number] => {
        const r = 10 + random() * 60;
        return [r * Math.cos(t), r * Math.sin(t)];
      });
      const sides: Side[] = corners.map((_, i) =>
        i === 0 || random() < 0.15 ? Math.round(4 + random() * 36) : "boundary",
      );
      const toggles = { ...ALL_RULES_ON };
      if (random() < 0.3) toggles[toggleKeys[Math.floor(random() * 4)] ?? "roadSetback"] = false;
      const result = evaluate(withToggles(plotInput(corners, sides), toggles));
      if (!result.ok) {
        expect(["too-small", "self-intersecting", "degenerate"]).toContain(result.error.code);
        continue;
      }
      successes++;
      expect({ plot: n, problems: violations(result, corners, sides, toggles) }).toEqual({
        plot: n,
        problems: [],
      });
    }
    expect(successes).toBeGreaterThan(150);
  });
});

describe("performance", () => {
  it("evaluates a 10-corner plot well within a frame budget", () => {
    const corners: [number, number][] = Array.from({ length: 10 }, (_, i) => {
      const t = (i / 10) * 2 * Math.PI;
      const r = i % 2 === 0 ? 45 : 32;
      return [r * Math.cos(t), r * Math.sin(t)];
    });
    const sides: Side[] = corners.map((_, i) => (i === 0 ? 20 : i === 3 ? 12 : "boundary"));
    const input = plotInput(corners, sides);
    success(evaluate(input));
    const runs = 20;
    const start = Date.now();
    for (let i = 0; i < runs; i++) evaluate(input);
    const ms = (Date.now() - start) / runs;
    expect(ms).toBeLessThan(200);
  });
});
