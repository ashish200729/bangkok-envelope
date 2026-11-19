import { describe, expect, it } from "vitest";
import { analyseSite, evaluate, type SiteAnalysis } from "../evaluate";
import { SAMPLE_INPUT } from "../fixtures";
import { ALL_RULES_ON, type EngineInput } from "../inputs";
import type { Check, CustomDesign, CustomDesignResult, Design } from "../outputs";
import { type DesignSpec, designSpecSchema, type FloorSpec } from "../spec";
import { plotInput, rect, type Side, seededRandom, success } from "../test-support";
import { DESIGN_ASSUMPTIONS } from "./assumptions";
import { areaOutsideEnvelopeM2 } from "./checks";
import { buildCustomDesign, cutFloors, sliceSetFor } from "./custom";
import { areaOutsideM2, ringPaths } from "./plates";
import { defaultFloorSpec, describeSpecChange } from "./studio";

const ID = "custom-test" as const;

function built(result: CustomDesignResult): CustomDesign {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.design;
}

function check(design: Design | CustomDesign, ruleId: string, n = 0): Check {
  const found = design.checks.filter((c) => c.ruleId === ruleId)[n];
  if (!found) throw new Error(`${design.id} has no ${ruleId} check #${n}`);
  return found;
}

function siteOf(input: EngineInput): SiteAnalysis {
  const analysis = analyseSite(input);
  if (!analysis.ok) throw new Error(analysis.error.code);
  return analysis.site;
}

/** Differences between a generated design and its rebuild from `design.spec`, as sentences. */
function reproductionProblems(input: EngineInput, design: Design): string[] {
  const parsed = designSpecSchema.safeParse(design.spec);
  if (!parsed.success) return [`${design.id}: spec invalid: ${parsed.error.message}`];
  const rebuilt = buildCustomDesign(input, design.spec, ID);
  if (!rebuilt.ok) return [`${design.id}: ${rebuilt.error.code}`];
  const out: string[] = [];
  const d = rebuilt.design;
  if (d.floors.length !== design.floors.length) out.push(`${design.id}: floor count`);
  design.floors.forEach((f, i) => {
    const g = d.floors[i];
    if (!g) return;
    if (g.use !== f.use || g.heightM !== f.heightM || Math.abs(g.z0M - f.z0M) > 1e-9)
      out.push(`${design.id}: floor ${i} use/height`);
    if (Math.abs(g.areaM2 - f.areaM2) > 0.5)
      out.push(`${design.id}: floor ${i} area ${g.areaM2} vs ${f.areaM2}`);
  });
  if (d.envelope !== design.envelope) out.push(`${design.id}: envelope`);
  return out.slice(0, 5);
}

/** Every structural invariant of an edited design, as sentences. */
function invariantProblems(input: EngineInput, spec: DesignSpec, d: CustomDesign): string[] {
  const out: string[] = [];
  const site = siteOf(input);
  const sum = d.floors.reduce((s, f) => s + f.areaM2, 0);
  if (Math.abs(sum - d.gfaM2) > 1e-6) out.push(`floors add to ${sum}, gfa ${d.gfaM2}`);
  if (d.floors.length !== spec.floors.length) out.push("floor dropped");
  if (Math.abs(d.openSpaceM2 + d.footprintM2 - site.plot.areaM2) > 1e-6) out.push("open space");
  if (d.passes !== !d.checks.some((c) => c.status === "fail")) out.push("passes");
  const set = sliceSetFor(site, spec.envelope);
  const floors = cutFloors(site, spec, set);
  const plot = ringPaths(site.plot.vertices);
  floors.forEach((f, i) => {
    if (Math.abs(f.plate.areaM2 - (d.floors[i]?.areaM2 ?? 0)) > 1e-6 && f.plate.areaM2 >= 1)
      out.push(`floor ${i} area mismatch`);
    const below = floors[i - 1];
    if (below && areaOutsideM2(f.plate.paths, below.plate.paths) > 0.05)
      out.push(`floor ${i} overhangs`);
    if (areaOutsideM2(f.plate.paths, plot) > 0.05) out.push(`floor ${i} outside the plot`);
  });
  const outside = areaOutsideEnvelopeM2(set, floors);
  const fit = check(d, "envelope.fit");
  if (spec.fitToEnvelope && outside >= 0.05) out.push(`fitted floors leave the envelope`);
  if ((fit.status === "pass") !== outside < 0.05) out.push("envelope.fit disagrees");
  const empty = d.floors.filter((f) => f.areaM2 === 0).length;
  const flagged = d.checks.filter((c) => c.ruleId === "envelope.fit").length === 2;
  if (empty > 0 !== flagged) out.push("empty floors not flagged");
  return out.slice(0, 5);
}

const sample = success(evaluate(SAMPLE_INPUT));
const byId = (id: string) => {
  const d = sample.designs.find((x) => x.id === id);
  if (!d) throw new Error(id);
  return d;
};

describe("generated designs carry their recipe", () => {
  it("rebuilds A, B and C on the sample plot floor by floor", () => {
    expect(sample.designs.length).toBe(3);
    for (const d of sample.designs) expect(reproductionProblems(SAMPLE_INPUT, d)).toEqual([]);
    expect(byId("midrise").spec.straight).toBe(true);
    expect(byId("podium-tower").spec.tower).not.toBeNull();
    expect(byId("stepped").spec.tower).toBeNull();
  });

  it("rebuilds the same checklist and numbers", () => {
    for (const d of sample.designs) {
      const r = built(buildCustomDesign(SAMPLE_INPUT, d.spec, ID));
      expect(r.gfaM2).toBeCloseTo(d.gfaM2, 0);
      expect(r.parking).toEqual(d.parking);
      expect(r.keyCount).toBe(d.keyCount);
      expect(r.checks.map((c) => [c.ruleId, c.status])).toEqual(
        d.checks.map((c) => [c.ruleId, c.status]),
      );
    }
  });

  it("rebuilds every design on 50 random plots", () => {
    const random = seededRandom(7);
    const types = ["condo", "office", "hotel"] as const;
    let checked = 0;
    for (let n = 0; n < 50; n++) {
      const count = 3 + Math.floor(random() * 8);
      const angles = Array.from({ length: count }, () => random() * 2 * Math.PI).sort(
        (a, b) => a - b,
      );
      const corners = angles.map((t): [number, number] => {
        const r = 14 + random() * 45;
        return [r * Math.cos(t), r * Math.sin(t)];
      });
      const sides: Side[] = corners.map((_, i) =>
        i === 0 || random() < 0.15 ? Math.round(6 + random() * 30) : "boundary",
      );
      const input = plotInput(corners, sides, {
        buildingType: types[n % 3] ?? "condo",
        zone: (["Y8", "Y9", "Y10"] as const)[Math.floor(random() * 3)] ?? "Y10",
        farBonusPct: random() < 0.3 ? 20 : 0,
        toggles: { ...ALL_RULES_ON, openSpace: random() > 0.15 },
      });
      const result = evaluate(input);
      if (!result.ok) continue;
      for (const d of result.designs) {
        checked++;
        expect({ plot: n, problems: reproductionProblems(input, d) }).toEqual({
          plot: n,
          problems: [],
        });
      }
    }
    expect(checked).toBeGreaterThan(80);
  }, 60_000);
});

describe("an edited design", () => {
  const tower = byId("podium-tower");

  it("adds up and never overhangs", () => {
    const d = built(buildCustomDesign(SAMPLE_INPUT, tower.spec, ID));
    expect(d.id).toBe(ID);
    expect(invariantProblems(SAMPLE_INPUT, tower.spec, d)).toEqual([]);
  });

  it("with fitToEnvelope, keeps every floor inside its band even when the tower is too big", () => {
    const spec: DesignSpec = {
      ...tower.spec,
      tower: { widthM: 120, depthM: 120, rotationDeg: 0, offsetM: { x: 0, y: 0 } },
    };
    const d = built(buildCustomDesign(SAMPLE_INPUT, spec, ID));
    expect(check(d, "envelope.fit").status).toBe("pass");
    expect(invariantProblems(SAMPLE_INPUT, spec, d)).toEqual([]);
  });

  it("without fitToEnvelope, an oversized tower fails the envelope check and is still measured", () => {
    const spec: DesignSpec = {
      ...tower.spec,
      fitToEnvelope: false,
      tower: { widthM: 120, depthM: 120, rotationDeg: 0, offsetM: { x: 0, y: 0 } },
    };
    const d = built(buildCustomDesign(SAMPLE_INPUT, spec, ID));
    const fit = check(d, "envelope.fit");
    expect(fit.status).toBe("fail");
    expect(fit.actual).toBeGreaterThan(100);
    expect(d.gfaM2).toBeGreaterThan(tower.gfaM2);
    expect(d.floors.every((f) => f.areaM2 > 0)).toBe(true);
    expect(check(d, "far.max").actual).toBeCloseTo(d.gfaM2 / sample.plotAreaM2);
    expect(d.parking.requiredSpaces).toBeGreaterThan(tower.parking.requiredSpaces);
    expect(invariantProblems(SAMPLE_INPUT, spec, d)).toEqual([]);
  });

  it("keeps floors that come out empty and flags them", () => {
    const top = tower.spec.floors[tower.spec.floors.length - 1] as FloorSpec;
    const spec: DesignSpec = {
      ...tower.spec,
      floors: [...tower.spec.floors, ...Array.from({ length: 40 }, () => top)],
    };
    const d = built(buildCustomDesign(SAMPLE_INPUT, spec, ID));
    expect(d.floors.length).toBe(spec.floors.length);
    const empty = d.floors.filter((f) => f.areaM2 === 0);
    expect(empty.length).toBeGreaterThan(0);
    const flag = check(d, "envelope.fit", 1);
    expect(flag.status).toBe("fail");
    expect(flag.message).toMatch(/^Floors \d+, .* and \d+ have no floor area/);
    expect(d.passes).toBe(false);
    expect(invariantProblems(SAMPLE_INPUT, spec, d)).toEqual([]);
  });

  it("returns empty-design when no floor has any area", () => {
    const spec: DesignSpec = {
      ...tower.spec,
      floors: [{ use: "lobby", heightM: 4.5, plate: "tower", insetM: 0 }],
      tower: { widthM: 10, depthM: 10, rotationDeg: 0, offsetM: { x: 190, y: 190 } },
    };
    const r = buildCustomDesign(SAMPLE_INPUT, spec, ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("empty-design");
  });

  it("returns the plot error for a plot the engine cannot use", () => {
    const input = plotInput(rect(4, 4), [6, "boundary", "boundary", "boundary"]);
    const r = buildCustomDesign(input, tower.spec, ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("too-small");
  });

  it("cuts a straight block to its top, so its walls do not step", () => {
    const stepped = { ...byId("midrise").spec, straight: false };
    const straight = built(buildCustomDesign(SAMPLE_INPUT, byId("midrise").spec, ID));
    const steps = built(buildCustomDesign(SAMPLE_INPUT, stepped, ID));
    const areas = straight.floors.slice(0, -1).map((f) => Math.round(f.areaM2));
    expect(new Set(areas).size).toBe(1);
    expect(steps.floors[0]?.areaM2).toBeGreaterThanOrEqual(straight.floors[0]?.areaM2 ?? 0);
  });
});

describe("uses in an edited design", () => {
  const base = byId("podium-tower").spec;
  const firstUse = base.floors.findIndex((f) => f.use === "residential");
  const withUse = (use: FloorSpec["use"], count: number): DesignSpec => ({
    ...base,
    floors: base.floors.map((f, i) => (i >= firstUse && i < firstUse + count ? { ...f, use } : f)),
  });

  it("an office floor in a condo changes keys, parking and adds the office size check", () => {
    const condo = built(buildCustomDesign(SAMPLE_INPUT, base, ID));
    const mixed = built(buildCustomDesign(SAMPLE_INPUT, withUse("office", 2), ID));
    expect(mixed.keyCount).toBeLessThan(condo.keyCount ?? 0);
    const officeArea = mixed.floors
      .filter((f) => f.use === "office")
      .reduce((s, f) => s + f.areaM2, 0);
    const office = mixed.checks.filter((c) => c.ruleId === "use.size")[1];
    expect(office?.actual).toBeCloseTo(officeArea);
    expect(office?.message).toMatch(/office floor/);
    expect(check(mixed, "parking.min").source.clause).toBe("3(1), 4");
    expect(mixed.parking.requiredSpaces).toBeGreaterThanOrEqual(Math.ceil(officeArea / 60));
  });

  it("the plan's office cap applies to office floors of a condo", () => {
    // A 10 m road keeps the ย.8 office cap at 1,000 m² (a 16 m road would lift it to 5,000 m²).
    const input = {
      ...SAMPLE_INPUT,
      zone: "Y8" as const,
      roads: SAMPLE_INPUT.roads.map((road) => ({ ...road, widthM: 10 })),
      site: { stationDistanceM: null },
    };
    const ownSpec = success(evaluate(input)).designs.find((d) => d.id === "podium-tower")?.spec;
    if (!ownSpec) throw new Error("no tower");
    const i0 = ownSpec.floors.findIndex((f) => f.use === "residential");
    const spec = {
      ...ownSpec,
      floors: ownSpec.floors.map((f, i) =>
        i >= i0 && i < i0 + 3 ? { ...f, use: "office" as const } : f,
      ),
    };
    const d = built(buildCustomDesign(input, spec, ID));
    const office = d.checks.filter((c) => c.ruleId === "use.size")[1];
    expect(office).toMatchObject({ status: "fail", limit: 1_000 });
    expect(office?.source).toEqual({ law: "bkk-plan-2556", clause: "15" });
  });

  it("retail needs one space per 20 m² from 300 m², and the plan caps it", () => {
    const d = built(buildCustomDesign(SAMPLE_INPUT, withUse("retail", 1), ID));
    const retail = d.floors.filter((f) => f.use === "retail").reduce((s, f) => s + f.areaM2, 0);
    expect(retail).toBeGreaterThan(300);
    const residentialLarge = Math.ceil(
      (d.gfaM2 - d.floors.filter((f) => f.use === "parking").reduce((s, f) => s + f.areaM2, 0)) /
        120,
    );
    expect(d.parking.requiredSpaces).toBe(Math.max(Math.ceil(retail / 20), residentialLarge));
    const cap = d.checks.find((c) => c.ruleId === "use.size" && /retail/.test(c.message));
    expect(cap?.source).toEqual({ law: "bkk-plan-2556", clause: "17(9)" });
    expect(cap?.status).toBe("pass");

    const narrow = {
      ...plotInput(rect(80, 90), [10, "boundary", "boundary", "boundary"]),
      site: { stationDistanceM: null },
    };
    const own = success(evaluate(narrow)).designs.find((x) => x.id === "midrise")?.spec;
    if (!own) throw new Error("no mid-rise design");
    const shops = { ...own, floors: own.floors.map((f) => ({ ...f, use: "retail" as const })) };
    const big = built(buildCustomDesign(narrow, shops, ID));
    expect(big.checks.find((c) => /retail/.test(c.message))).toMatchObject({
      status: "fail",
      limit: 5_000,
    });
    const nearStation = built(
      buildCustomDesign({ ...narrow, site: { stationDistanceM: 300 } }, shops, ID),
    );
    expect(nearStation.checks.find((c) => /retail/.test(c.message))?.status).toBe("pass");
  });

  it("amenity floors count toward floor area and the large-building rate only", () => {
    const d = built(buildCustomDesign(SAMPLE_INPUT, withUse("amenity", 2), ID));
    const condo = built(buildCustomDesign(SAMPLE_INPUT, base, ID));
    expect(d.gfaM2).toBeCloseTo(condo.gfaM2, 6);
    expect(d.parking.requiredSpaces).toBe(condo.parking.requiredSpaces);
    expect(d.keyCount).toBeLessThan(condo.keyCount ?? 0);
  });

  it("hotel floors in a condo count rooms for parking and the room cap", () => {
    const d = built(buildCustomDesign(SAMPLE_INPUT, withUse("hotel", 3), ID));
    const rooms = check(d, "use.rooms");
    const hotelArea = d.floors.filter((f) => f.use === "hotel").reduce((s, f) => s + f.areaM2, 0);
    expect(rooms.actual).toBe(Math.floor(hotelArea / DESIGN_ASSUMPTIONS.hotelM2PerKey.value));
  });

  it("unit size changes the key count and, above 60 m², the parking", () => {
    const small = built(buildCustomDesign(SAMPLE_INPUT, { ...base, unitSizeM2: 30 }, ID));
    const large = built(buildCustomDesign(SAMPLE_INPUT, { ...base, unitSizeM2: 90 }, ID));
    expect(small.keyCount).toBe(Math.floor((small.useAreaM2 * 0.67) / 30));
    expect(large.keyCount).toBe(Math.floor((large.useAreaM2 * 0.67) / 90));
    expect(large.parking.requiredSpaces).toBeGreaterThanOrEqual(large.keyCount ?? 0);
  });
});

describe("envelope choice", () => {
  it("a high-rise spec on an 8 m road gets geometry and fails the access checks", () => {
    const narrow = { ...SAMPLE_INPUT, roads: [{ ...SAMPLE_INPUT.roads[0], widthM: 8 }] };
    const result = success(evaluate(narrow));
    expect(result.envelopes.highRise).toBeNull();
    const mid = result.designs.find((d) => d.id === "midrise");
    if (!mid) throw new Error("no midrise");
    const extra = Array.from({ length: 6 }, () => defaultFloorSpec("residential"));
    const spec: DesignSpec = {
      ...mid.spec,
      envelope: "highRise",
      straight: false,
      floors: [...mid.spec.floors, ...extra],
    };
    const d = built(buildCustomDesign(narrow, spec, ID));
    expect(d.heightM).toBeGreaterThanOrEqual(23);
    expect(check(d, "highRise.road")).toMatchObject({ status: "fail", actual: 8, limit: 10 });
    expect(d.gfaM2).toBeGreaterThan(0);
    expect(check(d, "envelope.fit").status).toBe("pass");
  });

  it("a low-rise spec that grows past 23 m fails the envelope check", () => {
    const mid = byId("midrise");
    const extra = Array.from({ length: 4 }, () => defaultFloorSpec("residential"));
    const spec: DesignSpec = {
      ...mid.spec,
      fitToEnvelope: false,
      floors: [...mid.spec.floors, ...extra],
    };
    const d = built(buildCustomDesign(SAMPLE_INPUT, spec, ID));
    expect(d.heightM).toBeGreaterThanOrEqual(23);
    expect(check(d, "envelope.fit").status).toBe("fail");
  });
});

describe("spec schema", () => {
  const good = byId("podium-tower").spec;
  const floor = good.floors[0] as FloorSpec;
  it("accepts generated specs and rejects broken ones", () => {
    for (const d of sample.designs) expect(designSpecSchema.safeParse(d.spec).success).toBe(true);
    const bad: unknown[] = [
      { ...good, floors: [] },
      { ...good, floors: Array.from({ length: 81 }, () => floor) },
      { ...good, floors: [{ ...floor, heightM: 2.5 }] },
      { ...good, floors: [{ ...floor, insetM: 41 }] },
      { ...good, tower: null },
      { ...good, unitSizeM2: 10 },
      { ...good, extra: 1 },
    ];
    for (const spec of bad) expect(designSpecSchema.safeParse(spec).success).toBe(false);
  });
});

describe("studio helpers", () => {
  const spec = byId("podium-tower").spec;
  const at = (i: number, f: Partial<FloorSpec>): DesignSpec => ({
    ...spec,
    floors: spec.floors.map((x, k) => (k === i ? { ...x, ...f } : x)),
  });

  it("describes edits in one plain sentence", () => {
    expect(describeSpecChange(spec, at(7, { use: "office" }))).toBe(
      "Floor 8: Residential → Office",
    );
    expect(describeSpecChange(spec, at(2, { heightM: 3.5 }))).toBe("Floor 3: height 3 → 3.5 m");
    const added = { ...spec, floors: [...spec.floors, defaultFloorSpec("amenity")] };
    expect(describeSpecChange(spec, added)).toBe(`Added floor ${spec.floors.length + 1} (Amenity)`);
    expect(describeSpecChange(added, spec)).toBe(
      `Removed floor ${spec.floors.length + 1} (Amenity)`,
    );
    const noLobby = { ...spec, floors: spec.floors.slice(1) };
    expect(describeSpecChange(spec, noLobby)).toBe("Removed floor 1 (Lobby)");
    expect(describeSpecChange(spec, { ...spec, envelope: "lowRise" })).toBe(
      "Envelope: high-rise → low-rise",
    );
    expect(describeSpecChange(spec, { ...spec, tower: null })).toBe("Removed the tower");
    expect(describeSpecChange(spec, spec)).toBe("No change");
    const two = at(7, { use: "office" });
    expect(describeSpecChange(spec, { ...two, unitSizeM2: 60 })).toBe(
      "Unit size: 45 → 60 m²; Floor 8: Residential → Office",
    );
  });

  it("gives a new floor its use's height and the cut of the floor below", () => {
    expect(defaultFloorSpec("retail")).toEqual({
      use: "retail",
      heightM: 4.5,
      plate: "envelope",
      insetM: 0,
    });
    const towerFloor = spec.floors[spec.floors.length - 1] as FloorSpec;
    expect(defaultFloorSpec("office", towerFloor).plate).toBe("tower");
  });
});

function randomSpec(random: () => number, base: DesignSpec): DesignSpec {
  const uses = ["lobby", "parking", "retail", "amenity", "residential", "office", "hotel"] as const;
  const n = 1 + Math.floor(random() * 45);
  const floors: FloorSpec[] = Array.from({ length: n }, (_, i) => ({
    use: uses[Math.floor(random() * uses.length)] ?? "residential",
    heightM: 2.6 + Math.round(random() * 54) / 10,
    plate: i > 1 && random() < 0.6 ? "tower" : "envelope",
    insetM: random() < 0.6 ? 0 : Math.round(random() * 400) / 10,
  }));
  return {
    name: "Random",
    envelope: random() < 0.5 ? "lowRise" : "highRise",
    fitToEnvelope: random() < 0.75,
    straight: random() < 0.3,
    floors,
    tower:
      random() < 0.85
        ? {
            widthM: 8 + random() * 60,
            depthM: 8 + random() * 60,
            rotationDeg: -180 + random() * 360,
            offsetM: { x: -20 + random() * 40, y: -20 + random() * 40 },
          }
        : base.tower,
    unitSizeM2: 20 + random() * 120,
  };
}

describe("random specs on random plots (property test)", () => {
  it("never throws and keeps every invariant over 150 specs", () => {
    const random = seededRandom(424242);
    const base = byId("podium-tower").spec;
    let designs = 0;
    for (let n = 0; n < 150; n++) {
      const count = 3 + Math.floor(random() * 9);
      const angles = Array.from({ length: count }, () => random() * 2 * Math.PI).sort(
        (a, b) => a - b,
      );
      const corners = angles.map((t): [number, number] => {
        const r = 12 + random() * 50;
        return [r * Math.cos(t), r * Math.sin(t)];
      });
      const sides: Side[] = corners.map((_, i) =>
        i === 0 || random() < 0.15 ? Math.round(4 + random() * 36) : "boundary",
      );
      const input = plotInput(corners, sides, {
        buildingType: (["condo", "office", "hotel"] as const)[n % 3] ?? "condo",
        zone: (["Y8", "Y9", "Y10"] as const)[Math.floor(random() * 3)] ?? "Y10",
        site: { stationDistanceM: random() < 0.5 ? 300 : null },
        toggles: { ...ALL_RULES_ON, highRiseGate: random() > 0.15 },
      });
      const spec = randomSpec(random, base);
      const parsed = designSpecSchema.safeParse(spec);
      if (!parsed.success) continue;
      const result = buildCustomDesign(input, spec, ID);
      if (!result.ok) {
        expect(["too-small", "empty-design", "degenerate", "self-intersecting"]).toContain(
          result.error.code,
        );
        continue;
      }
      designs++;
      expect({ plot: n, problems: invariantProblems(input, spec, result.design) }).toEqual({
        plot: n,
        problems: [],
      });
      expect(JSON.parse(JSON.stringify(result.design))).toEqual(result.design);
    }
    expect(designs).toBeGreaterThan(80);
  }, 60_000);
});

describe("performance", () => {
  it("builds a 40-floor spec on a 10-corner plot within a slider frame", () => {
    const corners: [number, number][] = Array.from({ length: 10 }, (_, i) => {
      const t = (i / 10) * 2 * Math.PI;
      const r = i % 2 === 0 ? 45 : 32;
      return [r * Math.cos(t), r * Math.sin(t)];
    });
    const sides: Side[] = corners.map((_, i) => (i === 0 ? 20 : i === 3 ? 12 : "boundary"));
    const input = plotInput(corners, sides);
    const tower = success(evaluate(input)).designs.find((d) => d.id === "podium-tower");
    if (!tower) throw new Error("no tower");
    const towerFloor = tower.spec.floors[tower.spec.floors.length - 1] as FloorSpec;
    const spec: DesignSpec = {
      ...tower.spec,
      floors: [
        ...tower.spec.floors.slice(0, 4),
        ...Array.from({ length: 36 }, () => ({ ...towerFloor, insetM: 0 })),
      ],
    };
    expect(spec.floors.length).toBe(40);
    built(buildCustomDesign(input, spec, ID));
    const runs = 20;
    const start = Date.now();
    for (let i = 0; i < runs; i++) {
      const moved = { ...spec, tower: spec.tower && { ...spec.tower, rotationDeg: i } };
      buildCustomDesign(input, moved, ID);
    }
    const ms = (Date.now() - start) / runs;
    expect(ms).toBeLessThan(15);
  });
});
