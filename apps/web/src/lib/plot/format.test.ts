import { describe, expect, it } from "vitest";
import { formatThaiLandArea } from "./format";

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
