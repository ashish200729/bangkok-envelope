import { z } from "zod";
import { type Assumption, DESIGN_ASSUMPTIONS } from "../designs/assumptions";

/** A money or ratio assumption: a number with its source, how sure we are, and a caveat. */
export type FeasibilityAssumption = Assumption<number> & { note: string };

const BOI = "BOI Cost of Doing Business 2026, Tractus construction costs, Sep 2025";
const BIT = "buildinginthailand.com building costs (undated aggregator; house prices dated 2023)";
const KZ = "kz-archi.com, Construction costs Phuket 2026 (architect's blog)";
const SUPALAI = "Supalai financial highlights 2023–25";
const KF_OFFICE = "Knight Frank, Bangkok office market Q2 2026";
const KF_HOTEL = "Knight Frank, Bangkok & Phuket hotel market H1 2026";
const CW_CONDO = "Cushman & Wakefield, Bangkok condominium MarketBeat Q4 2025";
const JLL_OFFICE = "JLL, Bangkok office Q4 2025 (via press snippet)";
const JLL_RETAIL = "JLL, Bangkok retail Q4 2025 / Q1 2026";

/**
 * Every number the cost-and-return model uses, with its source. Money is THB; ratios are
 * fractions (8% is 0.08). Concept-stage figures: rough, and every one can be overridden.
 */
export const FEASIBILITY_ASSUMPTIONS = {
  costResidentialPerM2: {
    value: 35_000,
    unit: "THB per m² GFA",
    source: `Condo 25,000–30,000 average, 35,000–45,000 luxury, full fit-out (${BIT})`,
    confidence: "estimate",
    note: "Indicative: weak, undated source. An Asok new launch sits between average and luxury.",
  },
  costOfficePerM2: {
    value: 32_500,
    unit: "THB per m² GFA",
    source: `High-quality office 30,000–35,000, incl. communal A/C, electrics, sanitary (${BOI})`,
    confidence: "derived",
    note: "Midpoint of the stated range. Excludes tenant fit-out, site works, fees and land.",
  },
  costHotelPerM2: {
    value: 55_000,
    unit: "THB per m² GFA",
    source: `Hotel 3-star 40,000–50,000, 5-star 60,000–70,000, incl. FF&E (${BIT})`,
    confidence: "estimate",
    note: "Indicative: weak, undated source. Upscale, between the two classes.",
  },
  costRetailPerM2: {
    value: 27_500,
    unit: "THB per m² GFA",
    source: `No Bangkok retail rate found; medium-quality office 25,000–30,000 used (${BOI})`,
    confidence: "estimate",
    note: "Shell-and-core podium shops at the medium office rate.",
  },
  costAmenityPerM2: {
    value: 35_000,
    unit: "THB per m² GFA",
    source: "No source; priced like residential floors",
    confidence: "estimate",
    note: "Gym, pool deck or lounge floors.",
  },
  costLobbyPerM2: {
    value: 35_000,
    unit: "THB per m² GFA",
    source: `No source; top of the high-quality office range (${BOI})`,
    confidence: "estimate",
    note: "Ground-floor lobby with better finishes.",
  },
  costParkingPerM2: {
    value: 13_500,
    unit: "THB per m² GFA",
    source: `Multi-storey car park 12,000–15,000 (${BOI})`,
    confidence: "derived",
    note: "Midpoint. The designs' parking floors are above ground; a basement is 16,000–20,000.",
  },
  softCostShare: {
    value: 0.12,
    unit: "fraction of construction",
    source: `Design fees 1.5–8.5% (Bangkok Post, 2018); professional fees and studies 3–15% (${KZ})`,
    confidence: "estimate",
    note: "Fees, studies, permits and EIA. Financing and selling costs are not modelled separately.",
  },
  contingencyShare: {
    value: 0.08,
    unit: "fraction of construction",
    source: `Contingency 8–10% of construction (${KZ})`,
    confidence: "stated",
    note: "Low end of the stated range; a Phuket source.",
  },
  developerMargin: {
    value: 0.2,
    unit: "profit ÷ total cost incl. land",
    source: `Supalai net margin 16–19% of sales, about 19–23% profit on cost (${SUPALAI})`,
    confidence: "derived",
    note: "One listed developer; hold-for-income schemes often accept less.",
  },
  condoPricePerM2: {
    value: 242_130,
    unit: "THB per saleable m²",
    source: `Sukhumvit average of 2024–25 launches (${CW_CONDO}); Asoke examples 297,500–410,000`,
    confidence: "stated",
    note: "Launch prices. About 350,000 units are unsold, so the sale discount below applies.",
  },
  condoSaleDiscount: {
    value: 0.05,
    unit: "fraction of launch price",
    source: "No source; promotions and slow absorption (Knight Frank, condo market Q1 2026)",
    confidence: "estimate",
    note: "Reservation rate was 24.3%; sales are slow.",
  },
  condoSaleableEfficiency: {
    value: DESIGN_ASSUMPTIONS.condoEfficiency.value,
    unit: "saleable ÷ residential floor area",
    source: DESIGN_ASSUMPTIONS.condoEfficiency.source,
    confidence: DESIGN_ASSUMPTIONS.condoEfficiency.confidence,
    note: "The designs' own figure (unit counts). Not confirmed by a Bangkok market source.",
  },
  officeRentPerM2Month: {
    value: 898,
    unit: "THB per m² NLA per month",
    source: `Nana–Asoke–Phrom Phong asking rent, all grades (${KF_OFFICE})`,
    confidence: "stated",
    note: "Asking rent; incentives not shown. Bangkok Grade A averages 1,268.",
  },
  officeOccupancy: {
    value: 0.8,
    unit: "fraction let",
    source: `Nana–Asoke–Phrom Phong occupancy (${KF_OFFICE})`,
    confidence: "stated",
    note: "About 436,000 m² of new supply was due in 2026.",
  },
  officeLettableEfficiency: {
    value: 0.78,
    unit: "NLA ÷ office floor area",
    source: "No Bangkok source; a common office net-to-gross",
    confidence: "estimate",
    note: "Market rents are quoted on NLA.",
  },
  officeCapRate: {
    value: 0.06,
    unit: "NOI ÷ value",
    source: `Prime CBD office yield 5.6% (${JLL_OFFICE}); Grade B 6–7% not sourced`,
    confidence: "estimate",
    note: "A new building off the main road: a little above prime.",
  },
  retailRentPerM2Month: {
    value: 1_361,
    unit: "THB per m² NLA per month",
    source: `Half the JLL prime gross mall rent of 2,722 (${JLL_RETAIL})`,
    confidence: "estimate",
    note: "Street podium rent was not found; research suggests 40–60% of prime mall rent.",
  },
  retailOccupancy: {
    value: 0.85,
    unit: "fraction let",
    source: "No source for podium shops; prime malls are 96% let (Cushman & Wakefield Q3 2026)",
    confidence: "estimate",
    note: "Podium shops let less well than prime malls.",
  },
  retailLettableEfficiency: {
    value: 0.7,
    unit: "NLA ÷ retail floor area",
    source: "No source; shops lose corridors, services and back-of-house",
    confidence: "estimate",
    note: "",
  },
  retailCapRate: {
    value: 0.07,
    unit: "NOI ÷ value",
    source: "No Bangkok retail yield found",
    confidence: "estimate",
    note: "Above the office rate: smaller, riskier income.",
  },
  rentalOpexShare: {
    value: 0.2,
    unit: "fraction of rent collected",
    source: "No source; landlord's running costs where quoted rents include service",
    confidence: "estimate",
    note: "NOI = rent collected × (1 − this). Applies to office and retail.",
  },
  hotelAdr: {
    value: 4_197,
    unit: "THB per occupied room night",
    source: `Bangkok upscale average daily rate, H1 2026 (${KF_HOTEL})`,
    confidence: "stated",
    note: "Luxury 7,010, midscale 2,151. About 80% of the pipeline is upscale or luxury.",
  },
  hotelOccupancy: {
    value: 0.762,
    unit: "fraction of room nights",
    source: `Bangkok occupancy, all classes, H1 2026 (${KF_HOTEL})`,
    confidence: "stated",
    note: "Cushman & Wakefield gives 70% for Q3 2026.",
  },
  hotelRoomNoiMargin: {
    value: 0.35,
    unit: "NOI ÷ room revenue",
    source: "No source; room revenue only, after operating costs, fees and FF&E reserve",
    confidence: "estimate",
    note: "Food, drink and other income are left out.",
  },
  hotelCapRate: {
    value: 0.07,
    unit: "NOI ÷ value",
    source: "No Bangkok hotel yield found",
    confidence: "estimate",
    note: "Cross-check: about 5.8 m per key at the defaults, against 7 m asking (Sukhumvit 22, 2025) and 18.5 m paid (Hyatt Regency Sukhumvit, 2024).",
  },
  landPricePerSqWah: {
    value: 2_800_000,
    unit: "THB per sq wah",
    source:
      "Market price, Sukhumvit–Asok, 2025 (Agency for Real Estate Affairs, via The Bangkok Insight)",
    confidence: "stated",
    note: "Area average; Asok side-soi parcels were not found. 1 sq wah = 4 m².",
  },
  landTreasuryPerSqWah: {
    value: 750_000,
    unit: "THB per sq wah",
    source: "Treasury appraisal, Sukhumvit Road, 2023–26 round (Marketeer)",
    confidence: "stated",
    note: "A road-front maximum for tax, 30–40% or more below market. A new round starts 1 Jan 2027.",
  },
} as const satisfies Record<string, FeasibilityAssumption>;

export type FeasibilityKey = keyof typeof FEASIBILITY_ASSUMPTIONS;
export const FEASIBILITY_KEYS = Object.keys(FEASIBILITY_ASSUMPTIONS) as FeasibilityKey[];

/** The values the model runs on: defaults with the user's overrides applied. */
export type FeasibilityValues = Record<FeasibilityKey, number>;

const money = (max: number) => z.number().finite().min(0).max(max);
const fraction = z.number().finite().min(0).max(1);
const share = (min: number) => z.number().finite().min(min).max(1);
const capRate = z.number().finite().min(0.01).max(0.25);
const BOUNDS = {
  costResidentialPerM2: money(500_000),
  costOfficePerM2: money(500_000),
  costHotelPerM2: money(500_000),
  costRetailPerM2: money(500_000),
  costAmenityPerM2: money(500_000),
  costLobbyPerM2: money(500_000),
  costParkingPerM2: money(500_000),
  softCostShare: fraction,
  contingencyShare: fraction,
  developerMargin: fraction,
  condoPricePerM2: money(2_000_000),
  condoSaleDiscount: fraction,
  condoSaleableEfficiency: share(0.3),
  officeRentPerM2Month: money(20_000),
  officeOccupancy: fraction,
  officeLettableEfficiency: share(0.3),
  officeCapRate: capRate,
  retailRentPerM2Month: money(50_000),
  retailOccupancy: fraction,
  retailLettableEfficiency: share(0.3),
  retailCapRate: capRate,
  rentalOpexShare: fraction,
  hotelAdr: money(200_000),
  hotelOccupancy: fraction,
  hotelRoomNoiMargin: fraction,
  hotelCapRate: capRate,
  landPricePerSqWah: money(50_000_000),
  landTreasuryPerSqWah: money(50_000_000),
} as const satisfies Record<FeasibilityKey, z.ZodNumber>;

/**
 * The user's edits: any subset of the values, nothing else. Ratios are fractions; a margin of
 * 100% or more, a negative price or a cap rate under 1% is refused.
 */
export const feasibilityAssumptionsSchema = z.strictObject(BOUNDS).partial();
export type FeasibilityOverrides = z.infer<typeof feasibilityAssumptionsSchema>;

/** The defaults with the overrides applied. Validate overrides first (they are trusted here). */
export function resolveAssumptions(overrides: FeasibilityOverrides = {}): FeasibilityValues {
  const values = {} as FeasibilityValues;
  for (const key of FEASIBILITY_KEYS) {
    values[key] = overrides[key] ?? FEASIBILITY_ASSUMPTIONS[key].value;
  }
  return values;
}
