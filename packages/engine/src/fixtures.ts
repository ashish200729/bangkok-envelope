import { ALL_RULES_ON, type EngineInput } from "./inputs";

/**
 * Illustrative five-sided plot near Asok (Sukhumvit), used as the app's starting plot and in
 * tests. The road and its width are examples, not surveyed data.
 */
export const SAMPLE_INPUT = {
  plot: {
    vertices: [
      [100.55935, 13.73795],
      [100.5603, 13.7381],
      [100.56055, 13.73745],
      [100.56, 13.737],
      [100.55925, 13.73725],
    ],
    edges: [
      { kind: "road", roadId: "sample-soi" },
      { kind: "boundary" },
      { kind: "boundary" },
      { kind: "boundary" },
      { kind: "boundary" },
    ],
  },
  roads: [{ id: "sample-soi", name: "Sample soi", widthM: 12, widthSource: "user" }],
  zone: "Y10",
  buildingType: "condo",
  farBonusPct: 0,
  site: { stationDistanceM: 420 },
  toggles: ALL_RULES_ON,
} as const satisfies EngineInput;
