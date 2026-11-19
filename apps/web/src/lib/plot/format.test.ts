import { describe, expect, it } from "vitest";
import { formatDeg, formatM, formatThaiLandArea } from "./format";

describe("formatThaiLandArea", () => {
  it.each([
    [1600, "1 rai"],
    [5520, "3 rai 1 ngan 80 sq. wah"],
    [400, "1 ngan"],
    [10, "3 sq. wah"],
    [0, "0 sq. wah"],
  ])("%d m² is %s", (m2, expected) => {
    expect(formatThaiLandArea(m2)).toBe(expected);
  });
});

describe("lengths and angles", () => {
  it("shows lengths with one decimal and thousands separators", () => {
    expect(formatM(42)).toBe("42.0 m");
    expect(formatM(1234.56)).toBe("1,234.6 m");
  });

  it("shows whole degrees", () => {
    expect(formatDeg(91.6)).toBe("92°");
    expect(formatDeg(359.7)).toBe("0°");
  });
});
