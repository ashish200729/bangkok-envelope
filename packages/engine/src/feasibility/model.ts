import { hotelRooms, unitSizes } from "../designs/assumptions";
import { USE_LABEL } from "../designs/studio";
import { formatNumber } from "../format";
import type { EngineInput } from "../inputs";
import type { CustomDesign, Design, FloorUse } from "../outputs";
import { FLOOR_USES } from "../spec";
import { type FeasibilityKey, type FeasibilityValues, resolveAssumptions } from "./assumptions";
import { formatTHB, formatTHBPerM2, formatTHBPerSqWah } from "./format";

export const M2_PER_SQ_WAH = 4;

export type UseCost = { use: FloorUse; areaM2: number; ratePerM2: number; costTHB: number };

/** How a floor use earns: sold (condo), held and valued on income, or no direct value. */
export type ValueBasis = "sale" | "investment" | "none";

export type UseValue = {
  use: FloorUse;
  areaM2: number;
  basis: ValueBasis;
  /** Saleable or lettable area; 0 for floors with no direct value. */
  netAreaM2: number;
  /** Hotel rooms on hotel floors, else null. */
  rooms: number | null;
  /** Net operating income a year for investment uses, else null. */
  incomePerYearTHB: number | null;
  valueTHB: number;
};

/** One plain sentence of the arithmetic and the assumptions it used. */
export type FeasibilityLine = { text: string; keys: readonly FeasibilityKey[] };

export type Feasibility = {
  costs: {
    construction: { totalTHB: number; byUse: readonly UseCost[] };
    softCostsTHB: number;
    contingencyTHB: number;
    /** Construction + soft costs + contingency; land excluded. */
    totalTHB: number;
  };
  value: {
    kind: "sale" | "investment" | "mixed";
    grossDevelopmentValueTHB: number;
    /** NOI a year from office, retail and hotel floors; null when nothing is held for income. */
    incomePerYearTHB: number | null;
    byUse: readonly UseValue[];
  };
  /** Developer profit: `developerMargin` on all costs including the land it can pay for. */
  marginTHB: number;
  /** The most a developer could pay for the land: GDV ÷ (1 + margin) − costs. */
  leftForLandTHB: number;
  plotAreaM2: number;
  plotAreaSqWah: number;
  /** Plot area in sq wah × the market land price. */
  landCostTHB: number;
  /** The same at the Treasury appraisal, a second, lower reference. */
  landTreasuryCostTHB: number;
  landVerdict: "covers land" | "short of land";
  /** Left for land − land cost: the surplus, or the shortfall when negative. */
  landGapTHB: number;
  perM2: {
    costPerM2Gfa: number;
    gdvPerM2Gfa: number;
    leftForLandPerM2Gfa: number;
    leftForLandPerSqWah: number;
    landPricePerSqWah: number;
  };
  lines: readonly FeasibilityLine[];
};

const COST_KEY = {
  residential: "costResidentialPerM2",
  office: "costOfficePerM2",
  hotel: "costHotelPerM2",
  retail: "costRetailPerM2",
  amenity: "costAmenityPerM2",
  lobby: "costLobbyPerM2",
  parking: "costParkingPerM2",
} as const satisfies Record<FloorUse, FeasibilityKey>;

const DAYS_PER_YEAR = 365;
const DEFAULTS = resolveAssumptions();

const pct = (fraction: number) => `${formatNumber(fraction * 100, 1)}%`;
const m2 = (area: number) => `${formatNumber(area)} m²`;
const lower = (use: FloorUse) => USE_LABEL[use].toLowerCase();
/** ", b and c" after the first item; "" when there is nothing more. */
const listTail = (rest: readonly string[]) =>
  rest.length === 0
    ? ""
    : `${rest.length > 1 ? `, ${rest.slice(0, -1).join(", ")}` : ""} and ${rest.at(-1)}`;

function areasByUse(design: Design | CustomDesign): Record<FloorUse, number> {
  const areas = {
    lobby: 0,
    parking: 0,
    retail: 0,
    amenity: 0,
    residential: 0,
    office: 0,
    hotel: 0,
  };
  for (const floor of design.floors) areas[floor.use] += floor.areaM2;
  return areas;
}

function rentedUse(
  use: "office" | "retail",
  areaM2: number,
  a: FeasibilityValues,
  lines: FeasibilityLine[],
): UseValue {
  const [rent, occupancy, efficiency, capRate] =
    use === "office"
      ? ([
          "officeRentPerM2Month",
          "officeOccupancy",
          "officeLettableEfficiency",
          "officeCapRate",
        ] as const)
      : ([
          "retailRentPerM2Month",
          "retailOccupancy",
          "retailLettableEfficiency",
          "retailCapRate",
        ] as const);
  const netAreaM2 = areaM2 * a[efficiency];
  const collected = netAreaM2 * a[rent] * 12 * a[occupancy];
  const noi = collected * (1 - a.rentalOpexShare);
  const valueTHB = noi / a[capRate];
  lines.push({
    text: `${USE_LABEL[use]}: ${m2(netAreaM2)} lettable (${pct(a[efficiency])} of ${m2(areaM2)}) at ${formatTHBPerM2(a[rent])} a month, ${pct(a[occupancy])} let, less ${pct(a.rentalOpexShare)} running costs, earns ${formatTHB(noi)} a year; at a ${pct(a[capRate])} yield it is worth ${formatTHB(valueTHB)}.`,
    keys: [efficiency, rent, occupancy, "rentalOpexShare", capRate],
  });
  return {
    use,
    areaM2,
    basis: "investment",
    netAreaM2,
    rooms: null,
    incomePerYearTHB: noi,
    valueTHB,
  };
}

/**
 * Rough cost and return of one design: construction by floor use plus soft costs and
 * contingency; value by use (condos sold, offices, shops and hotel rooms capitalised on net
 * income; lobby, amenity and parking floors have no direct value); and what is left to pay for
 * the land after the developer's profit, against the land's market price. Pure and fast enough
 * to run for every design on every edit. All THB, unrounded.
 */
export function feasibilityFor(
  design: Design | CustomDesign,
  input: EngineInput,
  assumptions: FeasibilityValues = DEFAULTS,
): Feasibility {
  const a = assumptions;
  const lines: FeasibilityLine[] = [];
  const areas = areasByUse(design);
  const present = FLOOR_USES.filter((use) => areas[use] > 0);

  const byUseCost: UseCost[] = present.map((use) => {
    const ratePerM2 = a[COST_KEY[use]];
    return { use, areaM2: areas[use], ratePerM2, costTHB: areas[use] * ratePerM2 };
  });
  const construction = byUseCost.reduce((sum, c) => sum + c.costTHB, 0);
  const softCostsTHB = construction * a.softCostShare;
  const contingencyTHB = construction * a.contingencyShare;
  const totalCost = construction + softCostsTHB + contingencyTHB;
  lines.push({
    text: `Construction: ${byUseCost.map((c) => `${m2(c.areaM2)} of ${lower(c.use)} at ${formatTHBPerM2(c.ratePerM2)}`).join(", ")}, ${formatTHB(construction)} in all.`,
    keys: byUseCost.map((c) => COST_KEY[c.use]),
  });
  lines.push({
    text: `Fees and studies add ${pct(a.softCostShare)} (${formatTHB(softCostsTHB)}) and contingency ${pct(a.contingencyShare)} (${formatTHB(contingencyTHB)}): ${formatTHB(totalCost)} before land.`,
    keys: ["softCostShare", "contingencyShare"],
  });

  const byUseValue: UseValue[] = [];
  for (const use of present) {
    const areaM2 = areas[use];
    if (use === "residential") {
      const netAreaM2 = areaM2 * a.condoSaleableEfficiency;
      const price = a.condoPricePerM2 * (1 - a.condoSaleDiscount);
      const valueTHB = netAreaM2 * price;
      lines.push({
        text: `Condo sales: ${m2(netAreaM2)} saleable (${pct(a.condoSaleableEfficiency)} of ${m2(areaM2)}) at ${formatTHBPerM2(a.condoPricePerM2)} less ${pct(a.condoSaleDiscount)}, ${formatTHB(valueTHB)}.`,
        keys: ["condoSaleableEfficiency", "condoPricePerM2", "condoSaleDiscount"],
      });
      byUseValue.push({
        use,
        areaM2,
        basis: "sale",
        netAreaM2,
        rooms: null,
        incomePerYearTHB: null,
        valueTHB,
      });
    } else if (use === "office" || use === "retail") {
      byUseValue.push(rentedUse(use, areaM2, a, lines));
    } else if (use === "hotel") {
      const rooms = hotelRooms(
        areaM2,
        unitSizes(input.buildingType, design.spec.unitSizeM2).hotelM2PerKey,
      );
      const roomRevenue = rooms * a.hotelAdr * a.hotelOccupancy * DAYS_PER_YEAR;
      const noi = roomRevenue * a.hotelRoomNoiMargin;
      const valueTHB = noi / a.hotelCapRate;
      const perKey = rooms > 0 ? ` (${formatTHB(valueTHB / rooms)} a room)` : "";
      lines.push({
        text: `Hotel: ${formatNumber(rooms)} rooms at ${formatTHB(a.hotelAdr)} a night, ${pct(a.hotelOccupancy)} full, take ${formatTHB(roomRevenue)} a year; ${pct(a.hotelRoomNoiMargin)} of that is net income, ${formatTHB(noi)}, worth ${formatTHB(valueTHB)} at a ${pct(a.hotelCapRate)} yield${perKey}.`,
        keys: ["hotelAdr", "hotelOccupancy", "hotelRoomNoiMargin", "hotelCapRate"],
      });
      byUseValue.push({
        use,
        areaM2,
        basis: "investment",
        netAreaM2: areaM2,
        rooms,
        incomePerYearTHB: noi,
        valueTHB,
      });
    } else {
      byUseValue.push({
        use,
        areaM2,
        basis: "none",
        netAreaM2: 0,
        rooms: null,
        incomePerYearTHB: null,
        valueTHB: 0,
      });
    }
  }
  const noValue = present.filter(
    (use) => use === "lobby" || use === "amenity" || use === "parking",
  );
  if (noValue.length > 0) {
    lines.push({
      text: `${USE_LABEL[noValue[0] as FloorUse]}${listTail(noValue.slice(1).map(lower))} floors cost money but earn nothing directly (no sourced car park income).`,
      keys: [],
    });
  }

  const gdv = byUseValue.reduce((sum, v) => sum + v.valueTHB, 0);
  const sale = byUseValue.some((v) => v.basis === "sale");
  const held = byUseValue.filter((v) => v.basis === "investment");
  const income =
    held.length > 0 ? held.reduce((sum, v) => sum + (v.incomePerYearTHB ?? 0), 0) : null;
  const kind = held.length === 0 ? "sale" : sale ? "mixed" : "investment";

  const leftForLand = gdv / (1 + a.developerMargin) - totalCost;
  const margin = gdv - totalCost - leftForLand;
  lines.push({
    text: `Value ${formatTHB(gdv)}. Keeping ${pct(a.developerMargin)} profit on all costs including land (${formatTHB(margin)}) leaves ${leftForLand >= 0 ? `${formatTHB(leftForLand)} for the land` : `nothing for the land: it is ${formatTHB(-leftForLand)} short before the land is bought`}.`,
    keys: ["developerMargin"],
  });

  const plotAreaM2 = design.footprintM2 + design.openSpaceM2;
  const plotAreaSqWah = plotAreaM2 / M2_PER_SQ_WAH;
  const landCost = plotAreaSqWah * a.landPricePerSqWah;
  const landTreasuryCost = plotAreaSqWah * a.landTreasuryPerSqWah;
  const gap = leftForLand - landCost;
  const verdict = gap >= 0 ? "covers land" : "short of land";
  lines.push({
    text: `The plot is ${formatNumber(plotAreaSqWah)} sq wah (${m2(plotAreaM2)} ÷ 4); at ${formatTHBPerSqWah(a.landPricePerSqWah)} it costs ${formatTHB(landCost)}, so this design is ${gap >= 0 ? `${formatTHB(gap)} over` : `${formatTHB(-gap)} short of`} the land price (Treasury appraisal: ${formatTHB(landTreasuryCost)}).`,
    keys: ["landPricePerSqWah", "landTreasuryPerSqWah"],
  });

  const gfa = design.gfaM2;
  const perGfa = (n: number) => (gfa > 0 ? n / gfa : 0);
  return {
    costs: {
      construction: { totalTHB: construction, byUse: byUseCost },
      softCostsTHB,
      contingencyTHB,
      totalTHB: totalCost,
    },
    value: { kind, grossDevelopmentValueTHB: gdv, incomePerYearTHB: income, byUse: byUseValue },
    marginTHB: margin,
    leftForLandTHB: leftForLand,
    plotAreaM2,
    plotAreaSqWah,
    landCostTHB: landCost,
    landTreasuryCostTHB: landTreasuryCost,
    landVerdict: verdict,
    landGapTHB: gap,
    perM2: {
      costPerM2Gfa: perGfa(totalCost),
      gdvPerM2Gfa: perGfa(gdv),
      leftForLandPerM2Gfa: perGfa(leftForLand),
      leftForLandPerSqWah: plotAreaSqWah > 0 ? leftForLand / plotAreaSqWah : 0,
      landPricePerSqWah: a.landPricePerSqWah,
    },
    lines,
  };
}
