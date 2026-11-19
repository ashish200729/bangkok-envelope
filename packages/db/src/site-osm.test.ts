import { describe, expect, it } from "vitest";
import { STUDY_AREA } from "./site-area";
import {
  assembleRings,
  isRailStation,
  type OverpassResponse,
  relationToMultiPolygon,
  siteSnapshotSchema,
  snapshotFromOverpass,
  stringifySnapshot,
} from "./site-osm";

const meta = {
  bbox: STUDY_AREA.bbox,
  fetchedAt: "2026-11-19T00:00:00.000Z",
  source: "test",
  attribution: "© OpenStreetMap contributors",
  license: "ODbL",
  licenseUrl: "https://www.openstreetmap.org/copyright",
};
const pt = (lon: number, lat: number) => ({ lon, lat });

describe("assembleRings", () => {
  it("joins segments in any direction into a closed ring", () => {
    const rings = assembleRings([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 1],
        [1, 0],
      ],
      [
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ]);
    expect(rings).toEqual([
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ]);
  });

  it("drops chains that never close", () => {
    expect(
      assembleRings([
        [
          [0, 0],
          [1, 0],
        ],
      ]),
    ).toEqual([]);
  });
});

describe("relationToMultiPolygon", () => {
  it("puts each inner ring inside the outer that contains it", () => {
    const square = (x: number, size: number) => [
      pt(x, 0),
      pt(x + size, 0),
      pt(x + size, size),
      pt(x, size),
      pt(x, 0),
    ];
    const polygons = relationToMultiPolygon([
      { type: "way", role: "outer", geometry: square(0, 10) },
      { type: "way", role: "outer", geometry: square(20, 10) },
      { type: "way", role: "inner", geometry: square(22, 2) },
    ]);
    expect(polygons).toHaveLength(2);
    expect(polygons[0]).toHaveLength(1);
    expect(polygons[1]).toHaveLength(2);
  });
});

describe("isRailStation", () => {
  it("accepts rail stations and rejects bus stations", () => {
    expect(isRailStation({ railway: "station" })).toBe(true);
    expect(isRailStation({ public_transport: "station", station: "subway" })).toBe(true);
    expect(isRailStation({ public_transport: "station", light_rail: "yes" })).toBe(true);
    expect(isRailStation({ public_transport: "station", bus: "yes" })).toBe(false);
    expect(isRailStation({ public_transport: "platform", railway: "platform" })).toBe(false);
    expect(isRailStation({ public_transport: "station", railway: "halt", train: "yes" })).toBe(
      false,
    );
  });
});

describe("snapshotFromOverpass", () => {
  const response: OverpassResponse = {
    osm3s: { timestamp_osm_base: "2026-11-19T00:00:00Z" },
    elements: [
      {
        type: "way",
        id: 2,
        tags: { building: "yes", height: "20", "addr:street": "x" },
        geometry: [
          pt(100.56, 13.74),
          pt(100.5601, 13.74),
          pt(100.5601, 13.7401),
          pt(100.56, 13.74),
        ],
      },
      {
        type: "way",
        id: 1,
        tags: { highway: "residential", name: "Soi" },
        geometry: [pt(100.56, 13.74), pt(100.561, 13.741)],
      },
      { type: "way", id: 3, tags: { highway: "footway" }, geometry: [pt(0, 0), pt(1, 1)] },
      {
        type: "way",
        id: 4,
        tags: { highway: "service", service: "parking_aisle" },
        geometry: [pt(0, 0), pt(1, 1)],
      },
      {
        type: "node",
        id: 10,
        lat: 13.737,
        lon: 100.5604,
        tags: { railway: "station", name: "อโศก", "name:en": "Asok" },
      },
      {
        type: "way",
        id: 11,
        center: pt(100.5606, 13.7371),
        tags: {
          public_transport: "station",
          station: "light_rail",
          name: "อโศก",
          "name:en": "Asok",
          network: "BTS",
        },
      },
    ],
  };

  const snapshot = snapshotFromOverpass(response, meta);

  it("keeps buildings with only the tags the normalisers read", () => {
    expect(snapshot.buildings).toEqual([
      {
        id: "way/2",
        tags: { building: "yes", height: "20" },
        coordinates: [
          [
            [
              [100.56, 13.74],
              [100.5601, 13.74],
              [100.5601, 13.7401],
              [100.56, 13.74],
            ],
          ],
        ],
      },
    ]);
  });

  it("keeps carriageways and drops footways and parking aisles", () => {
    expect(snapshot.roads.map((r) => r.id)).toEqual(["way/1"]);
  });

  it("merges a station mapped twice, keeping the node and both sets of tags", () => {
    expect(snapshot.stations).toEqual([
      {
        id: "node/10",
        tags: {
          railway: "station",
          name: "อโศก",
          "name:en": "Asok",
          network: "BTS",
          public_transport: "station",
          station: "light_rail",
        },
        coordinates: [100.5604, 13.737],
      },
    ]);
  });

  it("round-trips through the committed text format", () => {
    const parsed = siteSnapshotSchema.parse(JSON.parse(stringifySnapshot(snapshot)));
    expect(parsed).toEqual(snapshot);
  });
});
