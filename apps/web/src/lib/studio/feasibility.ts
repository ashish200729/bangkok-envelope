import {
  type EngineInput,
  FEASIBILITY_ASSUMPTIONS,
  FEASIBILITY_KEYS,
  type Feasibility,
  type FeasibilityKey,
  type FeasibilityOverrides,
  type FeasibilityValues,
  feasibilityAssumptionsSchema,
  feasibilityFor,
  resolveAssumptions,
} from "@envelope/engine";
import { create } from "zustand";
import type { AnyDesign } from "@/lib/results/view";
import { browserStorage } from "./persist";

export const FEASIBILITY_STORAGE_KEY = "envelope.feasibility.v1";

export const ASSUMPTION_LABEL: Record<FeasibilityKey, string> = {
  costResidentialPerM2: "Homes",
  costOfficePerM2: "Offices",
  costHotelPerM2: "Hotel",
  costRetailPerM2: "Shops",
  costAmenityPerM2: "Amenity",
  costLobbyPerM2: "Lobby",
  costParkingPerM2: "Parking",
  softCostShare: "Soft costs",
  contingencyShare: "Contingency",
  developerMargin: "Developer profit",
  condoPricePerM2: "Sale price",
  condoSaleDiscount: "Sale discount",
  condoSaleableEfficiency: "Saleable share",
  officeRentPerM2Month: "Office rent",
  officeOccupancy: "Office occupancy",
  officeLettableEfficiency: "Office lettable share",
  officeCapRate: "Office cap rate",
  retailRentPerM2Month: "Shop rent",
  retailOccupancy: "Shop occupancy",
  retailLettableEfficiency: "Shop lettable share",
  retailCapRate: "Shop cap rate",
  rentalOpexShare: "Running costs",
  hotelAdr: "Average room rate",
  hotelOccupancy: "Hotel occupancy",
  hotelRoomNoiMargin: "Room profit margin",
  hotelCapRate: "Hotel cap rate",
  landPricePerSqWah: "Land price (market)",
  landTreasuryPerSqWah: "Land price (Treasury)",
};

/** The Return tab's assumption editor, in reading order. */
export const ASSUMPTION_GROUPS: { title: string; keys: FeasibilityKey[] }[] = [
  {
    title: "Construction cost",
    keys: FEASIBILITY_KEYS.filter((k) => k.startsWith("cost")),
  },
  { title: "Fees and profit", keys: ["softCostShare", "contingencyShare", "developerMargin"] },
  { title: "Condo sales", keys: FEASIBILITY_KEYS.filter((k) => k.startsWith("condo")) },
  {
    title: "Offices and shops",
    keys: FEASIBILITY_KEYS.filter(
      (k) => k.startsWith("office") || k.startsWith("retail") || k === "rentalOpexShare",
    ),
  },
  { title: "Hotel", keys: FEASIBILITY_KEYS.filter((k) => k.startsWith("hotel")) },
  { title: "Land", keys: FEASIBILITY_KEYS.filter((k) => k.startsWith("land")) },
];

/** Ratios are stored as fractions and edited as percentages. */
export const isFraction = (key: FeasibilityKey) =>
  !FEASIBILITY_ASSUMPTIONS[key].unit.startsWith("THB");

/** Reads saved overrides; anything the schema refuses is dropped. */
export function parseOverrides(value: unknown): FeasibilityOverrides {
  if (typeof value !== "object" || value === null) return {};
  const kept: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    const one = feasibilityAssumptionsSchema.safeParse({ [key]: v });
    if (one.success) kept[key] = v;
  }
  return kept as FeasibilityOverrides;
}

function loadOverrides(): FeasibilityOverrides {
  const storage = browserStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(FEASIBILITY_STORAGE_KEY);
    return raw ? parseOverrides(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function saveOverrides(overrides: FeasibilityOverrides) {
  const storage = browserStorage();
  if (!storage) return;
  try {
    if (Object.keys(overrides).length === 0) storage.removeItem(FEASIBILITY_STORAGE_KEY);
    else storage.setItem(FEASIBILITY_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage blocked or full: the edits still apply for this visit.
  }
}

type FeasibilityState = {
  overrides: FeasibilityOverrides;
  values: FeasibilityValues;
  loaded: boolean;
  load: () => void;
  /** Sets one assumption; returns false (and changes nothing) when the schema refuses it. */
  set: (key: FeasibilityKey, value: number) => boolean;
  reset: (key?: FeasibilityKey) => void;
};

export const useFeasibility = create<FeasibilityState>()((set, get) => ({
  overrides: {},
  values: resolveAssumptions(),
  loaded: false,
  load: () => {
    if (get().loaded) return;
    const overrides = loadOverrides();
    set({ overrides, values: resolveAssumptions(overrides), loaded: true });
  },
  set: (key, value) => {
    const next = { ...get().overrides, [key]: value };
    const parsed = feasibilityAssumptionsSchema.safeParse(next);
    if (!parsed.success) return false;
    if (value === FEASIBILITY_ASSUMPTIONS[key].value)
      delete (parsed.data as Record<string, unknown>)[key];
    saveOverrides(parsed.data);
    set({ overrides: parsed.data, values: resolveAssumptions(parsed.data) });
    return true;
  },
  reset: (key) => {
    const overrides = key ? { ...get().overrides } : {};
    if (key) delete overrides[key];
    saveOverrides(overrides);
    set({ overrides, values: resolveAssumptions(overrides) });
  },
}));

const cache = new WeakMap<
  AnyDesign,
  { values: FeasibilityValues; input: EngineInput; result: Feasibility }
>();

/** Cost and return of a design, remembered per design object and assumption set. */
export function feasibilityOf(
  design: AnyDesign,
  input: EngineInput,
  values: FeasibilityValues,
): Feasibility {
  const hit = cache.get(design);
  if (hit && hit.values === values && hit.input === input) return hit.result;
  const result = feasibilityFor(design, input, values);
  cache.set(design, { values, input, result });
  return result;
}

/** "Covers land" or "Short of land by ฿1.2 bn". */
export function verdictText(f: Feasibility, format: (thb: number) => string): string {
  return f.landVerdict === "covers land"
    ? "Pays for the land"
    : `${format(Math.abs(f.landGapTHB))} below the land price`;
}

/** The first web address in a source text, for a link. */
export function sourceUrl(source: string): string | null {
  return /https?:\/\/[^\s)]+/.exec(source)?.[0] ?? null;
}
