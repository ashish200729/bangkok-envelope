import { describe, expect, it } from "vitest";
import type { LngLat } from "./geo";
import { checkPlotShape } from "./plot";

const square: LngLat[] = [
  [100.56, 13.737],
  [100.5604, 13.737],
  [100.5604, 13.7374],
  [100.56, 13.7374],
];

describe("checkPlotShape", () => {
  it("accepts a plain plot and a concave L-shape regardless of road access", () => {
    const lShape: LngLat[] = [
      [100.56, 13.737],
      [100.5604, 13.737],
      [100.5604, 13.7372],
      [100.5602, 13.7372],
      [100.5602, 13.7374],
      [100.56, 13.7374],
    ];
    expect(checkPlotShape(square)).toEqual({ ok: true });
    expect(checkPlotShape(lShape)).toEqual({ ok: true });
  });

  it("rejects a bow-tie", () => {
    const bowTie = [square[0], square[2], square[1], square[3]] as LngLat[];
    const result = checkPlotShape(bowTie);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("self-intersecting");
  });

  it("rejects a corner dragged onto another side", () => {
    const touching: LngLat[] = [square[0], square[1], [100.5602, 13.737], square[3]] as LngLat[];
    expect(checkPlotShape(touching).ok).toBe(false);
  });

  it("rejects corners on one line", () => {
    const line: LngLat[] = [
      [100.56, 13.737],
      [100.5602, 13.737],
      [100.5604, 13.737],
    ];
    const result = checkPlotShape(line);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("degenerate");
  });
});
