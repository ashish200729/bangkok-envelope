import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { SAMPLE_INPUT } from "../fixtures";
import type { MultiPolygon, Polygon } from "../geo";
import { ALL_RULES_ON, type EngineInput } from "../inputs";
import type { Design, EngineSuccess, Envelope } from "../outputs";
import { distanceToSegment } from "../plot";
import { makeProjection, type XY } from "../projection";
import { farLimit, LAW, openSpaceMin, sizeCapForUse } from "../rules-data";
import { plotInput, rect, type Side, seededRandom, success } from "../test-support";
import { DESIGN_ASSUMPTIONS } from "./assumptions";

const CM = 0.01;

function check(design: Design, ruleId: string) {
  const found = design.checks.find((c) => c.ruleId === ruleId);
  if (!found) throw new Error(`${design.id} has no ${ruleId} check`);
  return found;
}

function byId(result: EngineSuccess, id: Design["id"]): Design {
  const design = result.designs.find((d) => d.id === id);
  if (!design) throw new Error(`no ${id} design`);
  return design;
}

function local(result: EngineSuccess, input: EngineInput) {
  const first = input.plot.vertices[0] ?? [0, 0];
  const projection = makeProjection(first);
  const toXY = (polygon: Polygon): XY[][] =>
    polygon.map((ring) => ring.map((p) => projection.toLocal(p)));
  return { projection, toXY, plotArea: result.plotAreaM2 };
}

function insideRings(p: XY, rings: readonly XY[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i] as XY;
      const b = ring[j] as XY;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function nearBoundary(p: XY, rings: readonly XY[][]): boolean {
  return rings.some((ring) =>
    ring.some((a, i) => {
      const b = ring[(i + 1) % ring.length] as XY;
      return distanceToSegment(p, a, b) < CM;
    }),
  );
}

/** Every vertex of `inner` lies inside one polygon of `outer`, or within 1 cm of its edge. */
function within(inner: XY[][], outer: XY[][][]): boolean {
  return inner.every((ring) =>
    ring.every((p) => outer.some((rings) => insideRings(p, rings) || nearBoundary(p, rings))),
  );
}

/** Every broken design invariant as a sentence; empty when the designs are sound. */
function designProblems(result: EngineSuccess, input: EngineInput): string[] {
  const found: string[] = [];
  const fail = (m: string) => found.length < 6 && found.push(m);
  const { toXY, plotArea } = local(result, input);
  let gateOff: EngineSuccess | undefined;
  const highRiseEnvelope = () => {
    if (result.envelopes.highRise) return result.envelopes.highRise;
    gateOff ??= success(evaluate({ ...input, toggles: { ...input.toggles, highRiseGate: false } }));
    return gateOff.envelopes.highRise;
  };
  const open = openSpaceMin(input.buildingType).value;
  const widest = Math.max(0, ...input.roads.map((r) => r.widthM));
  const size = sizeCapForUse(input.zone, input.buildingType, widest, input.site.stationDistanceM);

  for (const d of result.designs) {
    const tag = `${d.id}:`;
    const sum = d.floors.reduce((s, f) => s + f.areaM2, 0);
    if (Math.abs(sum - d.gfaM2) > 1e-6) fail(`${tag} floors add to ${sum}, gfa ${d.gfaM2}`);
    if (Math.abs(d.openSpaceM2 + d.footprintM2 - plotArea) > 1e-6)
      fail(`${tag} open + footprint ≠ plot`);
    if (d.footprintM2 !== d.floors[0]?.areaM2) fail(`${tag} footprint is not the ground floor`);
    const highRise = d.heightM >= 23;
    const far = farLimit(input.zone, input.farBonusPct, highRise) * plotArea;
    if (d.gfaM2 > far + 1e-6) fail(`${tag} gfa ${d.gfaM2} over FAR cap ${far}`);
    if (highRise && d.gfaM2 > 10 * plotArea + 1e-6) fail(`${tag} over the high-rise FAR ceiling`);
    if (
      highRise &&
      input.toggles.highRiseGate &&
      widest < LAW.highRiseLargeRoadM.value &&
      d.gfaM2 > LAW.highRiseLargeGfaM2 + 1e-6
    )
      fail(`${tag} over 30,000 m² on a road under 18 m`);
    if (size.kind === "capped") {
      const used = size.unit === "m2" ? d.useAreaM2 : (d.keyCount ?? 0);
      if (used > size.max + 1e-6) fail(`${tag} over the use-size cap`);
    }
    if (input.toggles.openSpace) {
      if (d.footprintM2 > (1 - open) * plotArea + 1e-6)
        fail(`${tag} footprint over the open-ground cap`);
      if (d.osrUsed < 0.04 - 1e-9) fail(`${tag} OSR ${d.osrUsed}`);
    }
    if (d.id === "midrise" && d.heightM >= 23) fail(`${tag} mid-rise reaches 23 m`);
    if (d.id === "podium-tower" && d.heightM < 23) fail(`${tag} tower below 23 m`);
    if (d.passes !== !d.checks.some((c) => c.status === "fail")) fail(`${tag} passes disagrees`);
    if (check(d, "envelope.fit").status !== "pass") fail(`${tag} envelope check failed`);
    const failing = d.checks.filter((c) => c.status === "fail").map((c) => c.ruleId);
    const allowedFails =
      d.id === "podium-tower"
        ? ["highRise.road", "highRise.frontage", "highRise.largeRoad", "parking.min"]
        : ["parking.min"];
    for (const ruleId of failing)
      if (!allowedFails.includes(ruleId)) fail(`${tag} fails ${ruleId}`);

    const envelope: Envelope | null =
      d.envelope === "lowRise" ? result.envelopes.lowRise : highRiseEnvelope();
    if (!envelope) {
      fail(`${tag} has no envelope`);
      continue;
    }
    let z = 0;
    d.floors.forEach((floor, level) => {
      if (floor.level !== level) fail(`${tag} level ${floor.level} at ${level}`);
      if (Math.abs(floor.z0M - z) > 1e-6) fail(`${tag} gap below level ${level}`);
      z = floor.z0M + floor.heightM;
      if (z > envelope.maxHeightM + 1e-6) fail(`${tag} level ${level} above the envelope`);
      const outline = toXY(floor.outline);
      const bands = envelope.slices.filter((s) => s.z1M > floor.z0M + 1e-6 && s.z0M < z - 1e-6);
      for (const band of bands) {
        const footprint = band.footprint.map((polygon: MultiPolygon[number]) => toXY(polygon));
        if (!within(outline, footprint))
          fail(`${tag} level ${level} outside ${band.z0M}–${band.z1M} m`);
      }
      const below = d.floors[level - 1];
      if (below && !within(outline, [toXY(below.outline)])) fail(`${tag} level ${level} overhangs`);
    });
    if (Math.abs(z - d.heightM) > 1e-6) fail(`${tag} height ${d.heightM} ≠ top ${z}`);
  }
  return found;
}

const sample = success(evaluate(SAMPLE_INPUT));

describe("designs on the sample plot", () => {
  it("returns a mid-rise, a podium + tower and a stepped design", () => {
    expect(sample.designs.map((d) => d.id)).toEqual(["midrise", "podium-tower", "stepped"]);
    expect(designProblems(sample, SAMPLE_INPUT)).toEqual([]);
  });

  it("gives sensible numbers", () => {
    const a = byId(sample, "midrise");
    const b = byId(sample, "podium-tower");
    expect(a.heightM).toBeLessThan(23);
    expect(a.floors[0]?.use).toBe("lobby");
    expect(b.heightM).toBeGreaterThanOrEqual(23);
    // On a 17 m road a high-rise may hold at most 30,000 m² (MR 33 cl. 2), below FAR 8 here.
    expect(b.farUsed).toBeLessThanOrEqual(8 + 1e-9);
    expect(b.gfaM2).toBeLessThanOrEqual(30_000 + 1e-6);
    expect(b.gfaM2).toBeGreaterThan(28_000);
    for (const d of sample.designs) {
      expect(d.passes).toBe(true);
      expect(d.keyCount).toBe(Math.floor((d.useAreaM2 * 0.67) / 45));
      expect(d.parking.providedSpaces).toBeGreaterThanOrEqual(d.parking.requiredSpaces);
      expect(d.summary).toMatch(/\.$/);
      expect(d.floors.every((f) => f.outline[0]?.length && f.outline[0].length >= 4)).toBe(true);
    }
  });

  it("puts parking at the bottom and the main use above it", () => {
    for (const d of sample.designs) {
      const uses = d.floors.map((f) => f.use);
      const firstUse = uses.indexOf("residential");
      expect(uses.slice(firstUse).every((u) => u === "residential")).toBe(true);
      expect(uses.slice(1, firstUse).every((u) => u === "parking")).toBe(true);
    }
  });

  it("keeps the tower plate near the target and inside the podium", () => {
    const b = byId(sample, "podium-tower");
    const tower = b.floors.filter((f) => f.use === "residential");
    expect(tower[0]?.areaM2).toBeLessThanOrEqual(DESIGN_ASSUMPTIONS.towerPlateM2.value.condo + 1);
    expect(tower[0]?.areaM2).toBeGreaterThan(900);
    expect(tower.every((f) => f.areaM2 >= DESIGN_ASSUMPTIONS.minTowerPlateM2.value)).toBe(true);
  });

  it("measures containment for real: the mid-rise lobby does not fit the high-rise envelope", () => {
    const { toXY } = local(sample, SAMPLE_INPUT);
    const lobby = byId(sample, "midrise").floors[0];
    const highRiseGround = sample.envelopes.highRise?.slices[0];
    if (!lobby || !highRiseGround) throw new Error("missing geometry");
    expect(
      within(
        toXY(lobby.outline),
        highRiseGround.footprint.map((p) => toXY(p)),
      ),
    ).toBe(false);
    const lowRiseGround = sample.envelopes.lowRise.slices[0];
    if (!lowRiseGround) throw new Error("missing geometry");
    expect(
      within(
        toXY(lobby.outline),
        lowRiseGround.footprint.map((p) => toXY(p)),
      ),
    ).toBe(true);
  });

  it("is plain JSON", () => {
    expect(JSON.parse(JSON.stringify(sample.designs))).toEqual(sample.designs);
  });
});

describe("high-rise access", () => {
  const narrow = { ...SAMPLE_INPUT, roads: [{ ...SAMPLE_INPUT.roads[0], widthM: 8 }] };

  it("on an 8 m road still shows the tower, failing the road check, while the mid-rise passes", () => {
    const result = success(evaluate(narrow));
    expect(result.envelopes.highRise).toBeNull();
    const a = byId(result, "midrise");
    const b = byId(result, "podium-tower");
    expect(a.passes).toBe(true);
    expect(b.passes).toBe(false);
    expect(check(b, "highRise.road")).toMatchObject({ status: "fail", actual: 8, limit: 10 });
    expect(check(b, "highRise.road").message).toMatch(/8 m wide; a high-rise needs .* 10 m/);
    expect(result.designs.length).toBeGreaterThanOrEqual(2);
    expect(designProblems(result, narrow)).toEqual([]);
  });

  it("with the gate switched off marks the access checks as not applicable", () => {
    const input = { ...narrow, toggles: { ...ALL_RULES_ON, highRiseGate: false } };
    const b = byId(success(evaluate(input)), "podium-tower");
    expect(check(b, "highRise.road")).toMatchObject({ status: "n/a", message: "Switched off" });
    expect(b.passes).toBe(true);
  });

  it("caps a high-rise at 30,000 m² on a road under 18 m and lifts the cap on a wide road", () => {
    const big = plotInput(rect(80, 90), [12, "boundary", "boundary", "boundary"]);
    const capped = byId(success(evaluate(big)), "podium-tower");
    expect(capped.gfaM2).toBeLessThanOrEqual(30_000 + 1e-6);
    expect(check(capped, "highRise.largeRoad").status).toBe("pass");
    const wide = plotInput(rect(80, 90), [30, "boundary", "boundary", "boundary"]);
    const tower = byId(success(evaluate(wide)), "podium-tower");
    expect(tower.gfaM2).toBeGreaterThan(30_000);
    expect(check(tower, "highRise.largeRoad").status).toBe("pass");
    expect(designProblems(success(evaluate(wide)), wide)).toEqual([]);
  });
});

describe("building type", () => {
  const results = (["condo", "office", "hotel"] as const).map((buildingType) => {
    const input = { ...SAMPLE_INPUT, buildingType };
    return { input, result: success(evaluate(input)) };
  });

  it("changes keys, parking and the open-ground limit", () => {
    const [condo, office, hotel] = results.map(({ result }) => byId(result, "midrise"));
    if (!condo || !office || !hotel) throw new Error("missing design");
    expect(condo.keyCount).toBeGreaterThan(0);
    expect(office.keyCount).toBeNull();
    expect(hotel.keyCount).toBe(Math.floor(hotel.useAreaM2 / 70));
    expect(check(condo, "openSpace.min").limit).toBe(0.3);
    expect(check(office, "openSpace.min").limit).toBe(0.1);
    expect(check(hotel, "openSpace.min").limit).toBe(0.1);
    expect(office.footprintM2).toBeGreaterThan(condo.footprintM2);
    const lobby = (d: Design) =>
      d.floors.filter((f) => f.use === "lobby").reduce((s, f) => s + f.areaM2, 0);
    const large = (d: Design) => Math.ceil((d.useAreaM2 + lobby(d)) / 120);
    const rooms = hotel.keyCount ?? 0;
    const hotelTable =
      10 + Math.ceil((Math.min(rooms, 100) - 30) / 5) + Math.ceil(Math.max(0, rooms - 100) / 10);
    expect(condo.parking.requiredSpaces).toBe(large(condo));
    expect(office.parking.requiredSpaces).toBe(
      Math.max(Math.ceil(office.useAreaM2 / 60), large(office)),
    );
    expect(hotel.parking.requiredSpaces).toBe(Math.max(hotelTable, large(hotel)));
    expect(office.parking.requiredSpaces).toBeGreaterThan(large(office));
    expect(check(hotel, "use.rooms").actual).toBe(hotel.keyCount);
    expect(check(condo, "use.size").status).toBe("n/a");
    for (const { input, result } of results) expect(designProblems(result, input)).toEqual([]);
  });

  it("keeps an office in ย.8 within its operating-area cap", () => {
    const input = {
      ...plotInput(rect(40, 50), [12, "boundary", "boundary", "boundary"]),
      zone: "Y8" as const,
      buildingType: "office" as const,
    };
    const result = success(evaluate(input));
    for (const d of result.designs) {
      expect(d.useAreaM2).toBeLessThanOrEqual(2_000 + 1e-6);
      expect(check(d, "use.size")).toMatchObject({ status: "pass", limit: 2_000 });
    }
    const near = success(evaluate({ ...input, site: { stationDistanceM: 300 } }));
    expect(Math.max(...near.designs.map((d) => d.useAreaM2))).toBeGreaterThan(2_000);
    expect(designProblems(result, input)).toEqual([]);
  });

  it("warns about the EIA without failing the design", () => {
    const eia = check(byId(sample, "podium-tower"), "eia.threshold");
    expect(eia.status).toBe("warn");
    expect(eia.source.law).toBe("eia");
    expect(eia.message).toMatch(/not a refusal/);
  });
});

describe("rules that change the designs", () => {
  it("a FAR bonus raises the floor area", () => {
    const base = { ...SAMPLE_INPUT, zone: "Y8" as const };
    const plain = byId(success(evaluate(base)), "podium-tower");
    const bonus = byId(success(evaluate({ ...base, farBonusPct: 20 })), "podium-tower");
    expect(bonus.gfaM2).toBeGreaterThan(plain.gfaM2 + 1_000);
    expect(check(bonus, "far.max").limit).toBeCloseTo(7.2);
  });

  it("switching open space off lifts the footprint cap and marks the checks n/a", () => {
    const input = { ...SAMPLE_INPUT, toggles: { ...ALL_RULES_ON, openSpace: false } };
    const result = success(evaluate(input));
    const a = byId(result, "midrise");
    expect(a.footprintM2).toBeGreaterThan(0.7 * result.plotAreaM2);
    expect(check(a, "openSpace.min")).toMatchObject({ status: "n/a", message: "Switched off" });
    expect(check(a, "osr.min").status).toBe("n/a");
    expect(designProblems(result, input)).toEqual([]);
  });

  it("caps the mid-rise footprint at 70% of a 40 × 50 m plot", () => {
    const input = plotInput(rect(40, 50), [12, "boundary", "boundary", "boundary"]);
    const a = byId(success(evaluate(input)), "midrise");
    expect(a.footprintM2).toBeLessThanOrEqual(1_400);
    expect(a.footprintM2).toBeGreaterThan(1_398);
    expect(a.floors.every((f) => f.areaM2 <= 1_400)).toBe(true);
  });
});

describe("small and awkward plots", () => {
  it("a small plot on a narrow soi gets small buildings or parking on the ground", () => {
    const input = plotInput(rect(16, 22), [6, "boundary", "boundary", "boundary"]);
    const result = success(evaluate(input));
    expect(result.designs.length).toBeGreaterThanOrEqual(2);
    for (const d of result.designs) expect(d.gfaM2).toBeGreaterThan(0);
    expect(designProblems(result, input)).toEqual([]);
  });

  it("a tiny plot returns a clean error or sound designs", () => {
    const input = plotInput(rect(8, 9), [6, "boundary", "boundary", "boundary"]);
    const result = evaluate(input);
    if (!result.ok) expect(result.error.code).toBe("too-small");
    else expect(designProblems(result, input)).toEqual([]);
  });

  it("a 12 m wide plot cannot hold a tower, so it gets a mid-rise and a stepped design", () => {
    const input = plotInput(rect(12, 80), [20, "boundary", "boundary", "boundary"]);
    const result = success(evaluate(input));
    expect(result.designs.map((d) => d.id)).toEqual(["midrise", "stepped"]);
    expect(designProblems(result, input)).toEqual([]);
  });
});

describe("random plots (property test)", () => {
  it("keeps every design invariant on 150 random plots and never throws", () => {
    const random = seededRandom(20261120);
    const types = ["condo", "office", "hotel"] as const;
    const zones = ["Y8", "Y9", "Y10"] as const;
    let withDesigns = 0;
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
      const toggles = { ...ALL_RULES_ON };
      if (random() < 0.15) toggles.openSpace = false;
      if (random() < 0.15) toggles.highRiseGate = false;
      const input = plotInput(corners, sides, {
        buildingType: types[Math.floor(random() * 3)] ?? "condo",
        zone: zones[Math.floor(random() * 3)] ?? "Y10",
        farBonusPct: random() < 0.3 ? Math.round(random() * 20) : 0,
        site: { stationDistanceM: random() < 0.5 ? 300 : null },
        toggles,
      });
      const result = evaluate(input);
      if (!result.ok) continue;
      if (result.designs.length > 0) withDesigns++;
      if (result.envelopes.lowRise.groundAreaM2 > 400) {
        expect({ plot: n, count: result.designs.length >= 2 }).toEqual({ plot: n, count: true });
      }
      expect({ plot: n, problems: designProblems(result, input) }).toEqual({
        plot: n,
        problems: [],
      });
    }
    expect(withDesigns).toBeGreaterThan(100);
  }, 60_000);
});

describe("performance", () => {
  it("evaluates a 10-corner plot, designs included, within a frame budget", () => {
    const corners: [number, number][] = Array.from({ length: 10 }, (_, i) => {
      const t = (i / 10) * 2 * Math.PI;
      const r = i % 2 === 0 ? 45 : 32;
      return [r * Math.cos(t), r * Math.sin(t)];
    });
    const sides: Side[] = corners.map((_, i) => (i === 0 ? 20 : i === 3 ? 12 : "boundary"));
    for (const buildingType of ["condo", "office", "hotel"] as const) {
      const input = plotInput(corners, sides, { buildingType });
      expect(success(evaluate(input)).designs.length).toBeGreaterThanOrEqual(2);
      const runs = 10;
      const start = Date.now();
      for (let i = 0; i < runs; i++) evaluate(input);
      expect((Date.now() - start) / runs).toBeLessThan(100);
    }
  });
});
