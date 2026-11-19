import { describe, expect, it } from "vitest";
import {
  FAR_BONUS_RULE,
  parseNumberInput,
  ROAD_WIDTH_RULE,
  STATION_DISTANCE_RULE,
} from "./number-input";

describe("parseNumberInput", () => {
  it("accepts values inside the range, ends included", () => {
    expect(parseNumberInput("0.5", ROAD_WIDTH_RULE)).toEqual({ ok: true, value: 0.5 });
    expect(parseNumberInput(" 200 ", ROAD_WIDTH_RULE)).toEqual({ ok: true, value: 200 });
    expect(parseNumberInput("20", FAR_BONUS_RULE)).toEqual({ ok: true, value: 20 });
    expect(parseNumberInput("0", STATION_DISTANCE_RULE)).toEqual({ ok: true, value: 0 });
  });

  it("refuses values outside the range instead of silently keeping the old one", () => {
    for (const text of ["0", "-5", "201", "0.4"]) {
      expect(parseNumberInput(text, ROAD_WIDTH_RULE)).toEqual({
        ok: false,
        hint: ROAD_WIDTH_RULE.hint,
      });
    }
    expect(parseNumberInput("25", FAR_BONUS_RULE).ok).toBe(false);
    expect(parseNumberInput("-1", STATION_DISTANCE_RULE).ok).toBe(false);
  });

  it("treats an empty field as unknown only where unknown is allowed", () => {
    expect(parseNumberInput("", STATION_DISTANCE_RULE)).toEqual({ ok: true, value: null });
    expect(parseNumberInput("", ROAD_WIDTH_RULE).ok).toBe(false);
    expect(parseNumberInput("", FAR_BONUS_RULE).ok).toBe(false);
  });

  it("refuses text the browser could not read as a number, even though it reports it empty", () => {
    expect(parseNumberInput("", STATION_DISTANCE_RULE, true).ok).toBe(false);
    expect(parseNumberInput("abc", ROAD_WIDTH_RULE).ok).toBe(false);
    expect(parseNumberInput("Infinity", STATION_DISTANCE_RULE).ok).toBe(false);
  });
});
