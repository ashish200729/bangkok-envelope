import { ALL_RULES_ON, type EngineInput } from "./inputs";

/**
 * Illustrative plot on open land on the east side of Asok Montri Road (Sukhumvit 21), about
 * 500 m from MRT Sukhumvit. OpenStreetMap shows no building on it. The first side follows the
 * road's property line (8.5 m east of its centreline); the other sides are neighbours. About
 * 4,060 m² (2.5 rai). The road width and zone are example values, not survey; the station
 * distance is what the site data reports (498 m).
 */
export const SAMPLE_INPUT = {
  plot: {
    vertices: [
      [100.5621732, 13.7424662],
      [100.5621287, 13.7418313],
      [100.5626777, 13.7417939],
      [100.5626967, 13.7424203],
    ],
    edges: [
      { kind: "road", roadId: "asok-montri" },
      { kind: "boundary" },
      { kind: "boundary" },
      { kind: "boundary" },
    ],
  },
  roads: [{ id: "asok-montri", name: "Asok Montri Road", widthM: 17, widthSource: "user" }],
  zone: "Y10",
  buildingType: "condo",
  farBonusPct: 0,
  site: { stationDistanceM: 498 },
  toggles: ALL_RULES_ON,
} as const satisfies EngineInput;
