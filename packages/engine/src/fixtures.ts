import { ALL_RULES_ON, type EngineInput } from "./inputs";

/**
 * Illustrative plot on the east side of Soi Sukhumvit 19, about 150 m north of Sukhumvit Road
 * near Asok. The first side follows the soi's property line (5 m east of its centreline, taken
 * from OpenStreetMap); the back boundary is irregular on purpose. About 3,500 m² (2.2 rai).
 * The soi width, zone and station distance are example values, not surveyed data.
 */
export const SAMPLE_INPUT = {
  plot: {
    vertices: [
      [100.5599408, 13.7382914],
      [100.5600231, 13.7388977],
      [100.5604593, 13.7388781],
      [100.5604544, 13.7384977],
      [100.560341, 13.7382129],
    ],
    edges: [
      { kind: "road", roadId: "soi-19" },
      { kind: "boundary" },
      { kind: "boundary" },
      { kind: "boundary" },
      { kind: "boundary" },
    ],
  },
  roads: [{ id: "soi-19", name: "Soi Sukhumvit 19", widthM: 10, widthSource: "user" }],
  zone: "Y10",
  buildingType: "condo",
  farBonusPct: 0,
  site: { stationDistanceM: 170 },
  toggles: ALL_RULES_ON,
} as const satisfies EngineInput;
