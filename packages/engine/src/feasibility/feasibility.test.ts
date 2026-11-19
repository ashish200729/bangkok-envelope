import { describe, expect, it } from "vitest";
import { DESIGN_ASSUMPTIONS } from "../designs/assumptions";
import { evaluate } from "../evaluate";
import { SAMPLE_INPUT } from "../fixtures";
import type { BuildingType, EngineInput } from "../inputs";
import type { Design, FloorUse } from "../outputs";
import { success } from "../test-support";
import {
  FEASIBILITY_ASSUMPTIONS,
  FEASIBILITY_KEYS,
  feasibilityAssumptionsSchema,
  resolveAssumptions,
} from "./assumptions";
import { formatTHB, formatTHBPerM2, formatTHBPerSqWah } from "./format";
import { feasibilityFor } from "./model";

/** A design with just the fields the model reads: floors, plot split and the unit size. */
function synthetic(
  floors: readonly [FloorUse, number][],
  { plotAreaM2 = 400, unitSizeM2 = 45 } = {},
): Design {
  const gfaM2 = floors.reduce((s, [, a]) => s + a, 0);
  const footprintM2 = plotAreaM2 * 0.7;
  return {
    id: "midrise",
    name: "Test",
    summary: "",
    spec: {
      name: "Test",
      envelope: "lowRise",
      fitToEnvelope: true,
      straight: false,
      floors: floors.map(([use]) => ({ use, heightM: 3.2, plate: "envelope", insetM: 0 })),
      tower: null,
      unitSizeM2,
    },
    envelope: "lowRise",
    floors: floors.map(([use, areaM2], level) => ({
      level,
      z0M: level * 3.2,
      heightM: 3.2,
      use,
      outline: [],
      areaM2,
    })),
    heightM: floors.length * 3.2,
    gfaM2,
    farUsed: gfaM2 / plotAreaM2,
    footprintM2,
    openSpaceM2: plotAreaM2 - footprintM2,
    osrUsed: (plotAreaM2 - footprintM2) / gfaM2,
    useAreaM2: gfaM2,
    keyCount: null,
    parking: { requiredSpaces: 0, providedSpaces: 0 },
    checks: [],
    passes: true,
  };
}

const typed = (buildingType: BuildingType): EngineInput => ({ ...SAMPLE_INPUT, buildingType });

describe("feasibility arithmetic (default assumptions, checked by hand)", () => {
  it("prices a condo: cost, sale value, left for land and the land at 4 m² per sq wah", () => {
    const f = feasibilityFor(synthetic([["residential", 1_000]]), typed("condo"));
    expect(f.costs.construction.totalTHB).toBe(35_000_000);
    expect(f.costs.softCostsTHB).toBeCloseTo(4_200_000, 3);
    expect(f.costs.contingencyTHB).toBeCloseTo(2_800_000, 3);
    expect(f.costs.totalTHB).toBeCloseTo(42_000_000, 3);
    // 1,000 × 0.67 × 242,130 × 0.95
    expect(f.value.grossDevelopmentValueTHB).toBeCloseTo(154_115_745, 0);
    expect(f.value.kind).toBe("sale");
    expect(f.value.incomePerYearTHB).toBeNull();
    // GDV ÷ 1.2 − cost
    expect(f.leftForLandTHB).toBeCloseTo(86_429_787.5, 0);
    expect(f.marginTHB).toBeCloseTo(0.2 * (42_000_000 + 86_429_787.5), 0);
    expect(f.plotAreaSqWah).toBe(100);
    expect(f.landCostTHB).toBe(280_000_000);
    expect(f.landTreasuryCostTHB).toBe(75_000_000);
    expect(f.landVerdict).toBe("short of land");
    expect(f.landGapTHB).toBeCloseTo(86_429_787.5 - 280_000_000, 0);
    expect(f.perM2.costPerM2Gfa).toBeCloseTo(42_000, 6);
    expect(f.perM2.leftForLandPerSqWah).toBeCloseTo(864_297.875, 3);
  });

  it("values offices on net income at the cap rate", () => {
    const f = feasibilityFor(synthetic([["office", 1_000]]), typed("office"));
    expect(f.costs.construction.totalTHB).toBe(32_500_000);
    // 780 m² NLA × 898 × 12 × 0.8 let × (1 − 0.2) = 5,379,379.2; ÷ 0.06
    expect(f.value.incomePerYearTHB).toBeCloseTo(5_379_379.2, 3);
    expect(f.value.grossDevelopmentValueTHB).toBeCloseTo(89_656_320, 2);
    expect(f.value.kind).toBe("investment");
  });

  it("values shops on net income at the retail cap rate", () => {
    const f = feasibilityFor(synthetic([["retail", 1_000]]), typed("office"));
    // 700 × 1,361 × 12 × 0.85 × 0.8 = 7,774,032; ÷ 0.07
    expect(f.value.incomePerYearTHB).toBeCloseTo(7_774_032, 3);
    expect(f.value.grossDevelopmentValueTHB).toBeCloseTo(111_057_600, 2);
  });

  it("values hotel rooms from ADR, occupancy and a room-income margin", () => {
    const f = feasibilityFor(synthetic([["hotel", 7_000]], { unitSizeM2: 70 }), typed("hotel"));
    const hotel = f.value.byUse.find((v) => v.use === "hotel");
    expect(hotel?.rooms).toBe(100);
    // 100 × 4,197 × 0.762 × 365 × 0.35 = 40,855,906.35; ÷ 0.07
    expect(f.value.incomePerYearTHB).toBeCloseTo(40_855_906.35, 2);
    expect(f.value.grossDevelopmentValueTHB).toBeCloseTo(583_655_805, 0);
    expect(f.costs.construction.totalTHB).toBe(385_000_000);
  });

  it("sizes rooms in a condo's hotel floors at the default key, not the condo unit size", () => {
    const f = feasibilityFor(synthetic([["hotel", 7_000]], { unitSizeM2: 30 }), typed("condo"));
    expect(f.value.byUse[0]?.rooms).toBe(7_000 / DESIGN_ASSUMPTIONS.hotelM2PerKey.value);
  });

  it("adds a mixed design up floor use by floor use", () => {
    const parts: [FloorUse, number][] = [
      ["retail", 1_000],
      ["office", 1_000],
      ["residential", 1_000],
    ];
    const mixed = feasibilityFor(synthetic(parts), typed("condo"));
    const each = parts.map(([use, area]) =>
      feasibilityFor(synthetic([[use, area]]), typed("condo")),
    );
    const sum = (pick: (f: typeof mixed) => number) => each.reduce((s, f) => s + pick(f), 0);
    expect(mixed.costs.totalTHB).toBeCloseTo(
      sum((f) => f.costs.totalTHB),
      3,
    );
    expect(mixed.value.grossDevelopmentValueTHB).toBeCloseTo(
      sum((f) => f.value.grossDevelopmentValueTHB),
      3,
    );
    expect(mixed.value.incomePerYearTHB).toBeCloseTo(5_379_379.2 + 7_774_032, 3);
    expect(mixed.value.kind).toBe("mixed");
    expect(mixed.costs.construction.byUse.map((c) => c.use)).toEqual([
      "retail",
      "residential",
      "office",
    ]);
  });

  it("counts parking, lobby and amenity floors as cost with no value", () => {
    const base = feasibilityFor(synthetic([["residential", 1_000]]), typed("condo"));
    const parked = feasibilityFor(
      synthetic([
        ["lobby", 100],
        ["parking", 1_000],
        ["amenity", 100],
        ["residential", 1_000],
      ]),
      typed("condo"),
    );
    expect(parked.costs.totalTHB - base.costs.totalTHB).toBeCloseTo(
      (13_500_000 + 3_500_000 + 3_500_000) * 1.2,
      3,
    );
    expect(parked.value.grossDevelopmentValueTHB).toBe(base.value.grossDevelopmentValueTHB);
    expect(parked.value.byUse.filter((v) => v.basis === "none").map((v) => v.use)).toEqual([
      "lobby",
      "parking",
      "amenity",
    ]);
    expect(parked.leftForLandTHB).toBeLessThan(base.leftForLandTHB);
    expect(parked.lines.map((l) => l.text)).toContain(
      "Lobby, parking and amenity floors cost money but earn nothing directly (no sourced car park income).",
    );
  });

  it("explains itself in sentences naming the assumptions it used", () => {
    const f = feasibilityFor(synthetic([["residential", 1_000]]), typed("condo"));
    expect(f.lines.map((l) => l.text).join(" ")).toContain("฿35,000 per m²");
    const used = new Set(f.lines.flatMap((l) => l.keys));
    for (const key of [
      "costResidentialPerM2",
      "softCostShare",
      "contingencyShare",
      "condoPricePerM2",
      "developerMargin",
      "landPricePerSqWah",
    ] as const)
      expect(used.has(key)).toBe(true);
    for (const key of used) expect(FEASIBILITY_KEYS).toContain(key);
  });
});

describe("assumptions", () => {
  it("every assumption has a value, unit, source and confidence", () => {
    for (const key of FEASIBILITY_KEYS) {
      const a = FEASIBILITY_ASSUMPTIONS[key];
      expect(a.source.length, key).toBeGreaterThan(10);
      expect(a.unit.length, key).toBeGreaterThan(0);
      expect(["stated", "derived", "estimate"], key).toContain(a.confidence);
      expect(Number.isFinite(a.value), key).toBe(true);
    }
  });

  it("the defaults pass their own schema", () => {
    const defaults = resolveAssumptions();
    expect(feasibilityAssumptionsSchema.safeParse(defaults).success).toBe(true);
  });

  it("reuses the designs' condo efficiency rather than a copy", () => {
    expect(FEASIBILITY_ASSUMPTIONS.condoSaleableEfficiency.value).toBe(
      DESIGN_ASSUMPTIONS.condoEfficiency.value,
    );
  });

  it("refuses negative prices, margins over 100%, unknown keys and zero cap rates", () => {
    const bad = [
      { condoPricePerM2: -1 },
      { landPricePerSqWah: -5 },
      { developerMargin: 1.2 },
      { officeCapRate: 0 },
      { officeOccupancy: 1.5 },
      { condoPricePerM2: Number.NaN },
      { somethingElse: 1 },
    ];
    for (const overrides of bad)
      expect(
        feasibilityAssumptionsSchema.safeParse(overrides).success,
        JSON.stringify(overrides),
      ).toBe(false);
    expect(feasibilityAssumptionsSchema.safeParse({}).success).toBe(true);
    expect(feasibilityAssumptionsSchema.safeParse({ developerMargin: 0.15 }).success).toBe(true);
  });

  it("overrides change the outputs; the rest keep their defaults", () => {
    const parsed = feasibilityAssumptionsSchema.parse({
      condoPricePerM2: 300_000,
      landPricePerSqWah: 100_000,
    });
    const values = resolveAssumptions(parsed);
    expect(values.costResidentialPerM2).toBe(35_000);
    const design = synthetic([["residential", 1_000]]);
    const base = feasibilityFor(design, typed("condo"));
    const edited = feasibilityFor(design, typed("condo"), values);
    expect(edited.value.grossDevelopmentValueTHB).toBeCloseTo(1_000 * 0.67 * 300_000 * 0.95, 3);
    expect(edited.costs.totalTHB).toBe(base.costs.totalTHB);
    expect(edited.landCostTHB).toBe(10_000_000);
    expect(edited.landVerdict).toBe("covers land");
    const noMargin = feasibilityFor(
      design,
      typed("condo"),
      resolveAssumptions({ developerMargin: 0 }),
    );
    expect(noMargin.leftForLandTHB).toBeCloseTo(
      base.value.grossDevelopmentValueTHB - base.costs.totalTHB,
      3,
    );
  });
});

describe("sample site (Soi Sukhumvit 19, near Asok)", () => {
  for (const buildingType of ["condo", "office", "hotel"] as const) {
    it(`${buildingType} designs give believable orders of magnitude`, () => {
      const input = typed(buildingType);
      const result = success(evaluate(input));
      expect(result.designs.length).toBeGreaterThan(0);
      for (const design of result.designs) {
        const f = feasibilityFor(design, input);
        expect(f.plotAreaM2).toBeCloseTo(result.plotAreaM2, 3);
        // Total cost before land: 30,000–70,000 per m² of GFA across all uses incl. parking.
        expect(f.perM2.costPerM2Gfa, design.id).toBeGreaterThan(25_000);
        expect(f.perM2.costPerM2Gfa, design.id).toBeLessThan(70_000);
        // Value per m² of GFA: an Asok condo sells for ~230,000 per saleable m², so about
        // 80,000–170,000 per m² of all floors once lobby and parking are counted; held uses
        // are lower.
        expect(f.perM2.gdvPerM2Gfa, design.id).toBeGreaterThan(40_000);
        expect(f.perM2.gdvPerM2Gfa, design.id).toBeLessThan(180_000);
        if (buildingType === "condo")
          expect(f.perM2.gdvPerM2Gfa, design.id).toBeGreaterThan(80_000);
        expect(f.landCostTHB).toBeGreaterThan(2e9);
        expect(f.landCostTHB).toBeLessThan(3e9);
      }
    });
  }

  // About 8 ms when the machine is quiet. Best of five, because the gate runs every
  // package's tests and builds at once and a single run can stall on a busy CPU.
  it("1,000 calls take under 50 ms", () => {
    const input = typed("condo");
    const designs = success(evaluate(input)).designs;
    const values = resolveAssumptions();
    for (let i = 0; i < 200; i++)
      feasibilityFor(designs[i % designs.length] as Design, input, values);
    const runs = Array.from({ length: 5 }, () => {
      const start = Date.now();
      for (let i = 0; i < 1_000; i++)
        feasibilityFor(designs[i % designs.length] as Design, input, values);
      return Date.now() - start;
    });
    expect(Math.min(...runs)).toBeLessThan(50);
  });
});

describe("formatTHB", () => {
  it("shortens billions and millions to three figures and keeps smaller sums whole", () => {
    expect(formatTHB(2_481_000_000)).toBe("฿2.48 bn");
    expect(formatTHB(330_200_000)).toBe("฿330 m");
    expect(formatTHB(12_500)).toBe("฿12,500");
    expect(formatTHB(999_999_999)).toBe("฿1 bn");
    expect(formatTHB(-1_200_000_000)).toBe("−฿1.2 bn");
    expect(formatTHB(0)).toBe("฿0");
    expect(formatTHBPerM2(35_000)).toBe("฿35,000 per m²");
    expect(formatTHBPerSqWah(2_800_000)).toBe("฿2.8 m per sq wah");
  });
});
