import { MAX_FAR_BONUS_PCT } from "@envelope/engine";

/** What a number field accepts, and what it tells the user otherwise. */
export type NumberRule = {
  min: number;
  max: number;
  /** "unknown": an empty field means no value (null); "invalid": a value is required. */
  empty: "unknown" | "invalid";
  /** Shown when the text is not accepted, e.g. "Enter a width from 0.5 to 200 m." */
  hint: string;
};

export type ParsedNumber = { ok: true; value: number | null } | { ok: false; hint: string };

/**
 * Reads a number field. `badInput` is the browser's flag for text a number input cannot parse
 * (it then reports an empty value), so "-" or "1e" is not mistaken for an empty field.
 */
export function parseNumberInput(text: string, rule: NumberRule, badInput = false): ParsedNumber {
  const trimmed = text.trim();
  if (badInput) return { ok: false, hint: rule.hint };
  if (trimmed === "") {
    return rule.empty === "unknown" ? { ok: true, value: null } : { ok: false, hint: rule.hint };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < rule.min || value > rule.max) {
    return { ok: false, hint: rule.hint };
  }
  return { ok: true, value };
}

export const ROAD_WIDTH_RULE: NumberRule = {
  min: 0.5,
  max: 200,
  empty: "invalid",
  hint: "Enter a road width from 0.5 to 200 m.",
};

export const STATION_DISTANCE_RULE: NumberRule = {
  min: 0,
  max: 100_000,
  empty: "unknown",
  hint: "Enter a distance in metres (0 or more), or leave it empty if unknown.",
};

export const FAR_BONUS_RULE: NumberRule = {
  min: 0,
  max: MAX_FAR_BONUS_PCT,
  empty: "invalid",
  hint: `Enter a bonus from 0 to ${MAX_FAR_BONUS_PCT}%.`,
};
