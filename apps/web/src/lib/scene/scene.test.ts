import {
  type Design,
  type EngineInput,
  type EngineSuccess,
  evaluate,
  makeProjection,
  SAMPLE_INPUT,
  type XY,
} from "@envelope/engine";
import { describe, expect, it } from "vitest";
import { outlinePolygons } from "@/lib/results/designs";
import { useResultsView } from "@/lib/results/view";
import { formatMetres, heightCallout, siteAnnotations } from "./annotations";
import { asBuiltSummary } from "./as-built";
import { ccw, distanceToRing, offsetRing, openRing, pointInRing, ringEdges } from "./geometry";
import {
  BUILDING_CLEARANCE_M,
  EDGE_CLEARANCE_M,
  GRID_ORIGIN,
  placeTrees,
  siteLandscape,
} from "./landscape";
import { bayCentres, designMassing } from "./massing";
import { hash01 } from "./random";
import { groundShadow } from "./shadow";
import { bangkokTimestamp, formatHour, sceneLighting, sunPosition } from "./sun";

function run(input: EngineInput = SAMPLE_INPUT): EngineSuccess {
  const result = evaluate(input);
  if (!result.ok) throw new Error(result.error.code);
  return result;
}

function tower(result = run()): Design {
  const design = result.designs.find((d) => d.id === "podium-tower");
  if (!design) throw new Error("the sample plot should hold a podium and tower");
  return design;
}

const square = (side: number, x0 = 0, y0 = 0): XY[] => [
  { x: x0, y: y0 },
  { x: x0 + side, y: y0 },
  { x: x0 + side, y: y0 + side },
  { x: x0, y: y0 + side },
];

describe("window bays along a façade edge", () => {
  it("spreads bays of about the spacing evenly, with equal end margins", () => {
    const centres = bayCentres(36, 3.6);
    expect(centres).toHaveLength(10);
    expect(centres[0]).toBeCloseTo(1.8);
    expect(centres.at(-1)).toBeCloseTo(36 - 1.8);
    const steps = centres.slice(1).map((c, i) => c - (centres[i] ?? 0));
    for (const step of steps) expect(step).toBeCloseTo(3.6);
  });

  it("rounds to the nearest whole number of bays", () => {
    expect(bayCentres(10, 3.6)).toHaveLength(3);
    expect(bayCentres(3, 3.6)).toHaveLength(1);
  });

  it("puts no window on an edge shorter than three quarters of a bay", () => {
    expect(bayCentres(2.6, 3.6)).toEqual([]);
  });
});

describe("massing for a design", () => {
  it("draws one façade band and one floor line per floor plate", () => {
    const design = tower();
    const massing = designMassing(design);
    const plates = design.floors.reduce((n, f) => n + outlinePolygons(f.outline).length, 0);
    expect(massing.facades).toHaveLength(plates);
    expect(massing.slabs).toHaveLength(plates);
    for (const band of massing.facades) {
      expect(band.polygon[0]?.[0]?.[2]).toBeCloseTo(band.floor.z0M + 0.24);
    }
  });

  it("puts every window pane on its floor's façade, within the band", () => {
    const design = tower();
    const massing = designMassing(design);
    const first = design.floors[0]?.outline[0]?.[0];
    if (!first) throw new Error("no outline");
    const projection = makeProjection(first);
    expect(massing.panes.length).toBeGreaterThan(100);
    for (const pane of massing.panes) {
      const floor = design.floors.find((f) => f.level === pane.level);
      if (!floor) throw new Error("pane without a floor");
      const ring = ccw(openRing(floor.outline[0] ?? []).map(projection.toLocal));
      const at = projection.toLocal([pane.position[0], pane.position[1]]);
      expect(distanceToRing(at, ring)).toBeLessThan(0.2);
      expect(pane.position[2]).toBeGreaterThan(floor.z0M);
      expect(pane.position[2] + pane.scale[2]).toBeLessThan(floor.z0M + floor.heightM);
    }
  });

  it("puts a plant room on the roof and the height callout above it", () => {
    const design = tower();
    const massing = designMassing(design);
    const roofBoxes = massing.boxes.filter((b) => b.position[2] >= design.heightM - 0.01);
    expect(roofBoxes.length).toBeGreaterThanOrEqual(2);
    const callout = heightCallout(design, massing);
    expect(callout?.text).toBe(`${Math.round(design.heightM)} m · ${design.floors.length} storeys`);
    expect(callout?.position[2]).toBeGreaterThan(design.heightM + 3);
  });

  it("is the same for the same design, and lights the same windows at night", () => {
    const a = designMassing(tower(run()));
    const b = designMassing(tower(run()));
    expect(a.panes.map((p) => p.lit)).toEqual(b.panes.map((p) => p.lit));
    expect(a.panes.map((p) => p.position)).toEqual(b.panes.map((p) => p.position));
    const lit = a.panes.filter((p) => p.lit).length / a.panes.length;
    expect(lit).toBeGreaterThan(0.6);
    expect(lit).toBeLessThan(0.82);
  });
});

describe("trees on open ground", () => {
  const plot = square(60);
  const building = square(24, 18, 18);

  it("stay inside the plot, clear of its sides and the building", () => {
    const trees = placeTrees(plot, [building]);
    expect(trees.length).toBeGreaterThan(5);
    for (const t of trees) {
      expect(pointInRing(t, plot)).toBe(true);
      expect(distanceToRing(t, plot)).toBeGreaterThanOrEqual(EDGE_CLEARANCE_M);
      expect(pointInRing(t, building)).toBe(false);
      expect(distanceToRing(t, building)).toBeGreaterThanOrEqual(BUILDING_CLEARANCE_M);
    }
  });

  it("are placed the same way every time", () => {
    expect(placeTrees(plot, [building])).toEqual(placeTrees(plot, [building]));
  });

  it("mostly stay put when one corner moves, because the grid is fixed to the ground", () => {
    const before = placeTrees(plot, [building]);
    const moved = [...plot.slice(0, 2), { x: 63, y: 61 }, plot[3] as XY];
    const after = placeTrees(moved, [building]);
    const kept = before.filter((t) => after.some((u) => u.x === t.x && u.y === t.y));
    expect(kept.length / before.length).toBeGreaterThan(0.8);
  });

  it("on the sample plot, land inside it in lng/lat", () => {
    const result = run();
    const design = tower(result);
    const envelope = result.envelopes.highRise;
    const site = siteLandscape({
      plot: SAMPLE_INPUT.plot.vertices,
      design,
      buildable: envelope?.slices[0]?.footprint ?? null,
    });
    const projection = makeProjection(GRID_ORIGIN);
    const ring = SAMPLE_INPUT.plot.vertices.map(projection.toLocal);
    for (const tree of site.trees) {
      expect(pointInRing(projection.toLocal([tree.position[0], tree.position[1]]), ring)).toBe(
        true,
      );
    }
    expect(site.ground.length).toBeGreaterThanOrEqual(2);
  });
});

describe("setback and road callouts", () => {
  it("label the sample plot's road side with the 6 m high-rise clearance", () => {
    const result = run();
    const site = siteAnnotations(
      SAMPLE_INPUT,
      result.envelopes.highRise?.slices[0]?.footprint ?? null,
    );
    expect(site.setback.map((c) => c.text)).toEqual(["6 m setback"]);
    expect(site.road.map((c) => c.text)).toEqual([`${SAMPLE_INPUT.roads[0]?.widthM} m road`]);
    expect(site.bands.length).toBeGreaterThan(0);
  });

  it("draws the band inside the plot", () => {
    const result = run();
    const site = siteAnnotations(
      SAMPLE_INPUT,
      result.envelopes.lowRise.slices[0]?.footprint ?? null,
    );
    const projection = makeProjection(SAMPLE_INPUT.plot.vertices[0] ?? [0, 0]);
    const plot = ccw(SAMPLE_INPUT.plot.vertices.map(projection.toLocal));
    const grown = offsetRing(plot, 0.05);
    for (const band of site.bands) {
      for (const [lng, lat] of band.polygon[0] ?? []) {
        expect(pointInRing(projection.toLocal([lng, lat]), grown)).toBe(true);
      }
    }
  });

  it("formats metres plainly", () => {
    expect(formatMetres(6)).toBe("6 m");
    expect(formatMetres(5.98)).toBe("6 m");
    expect(formatMetres(1.2)).toBe("1.2 m");
  });
});

describe("sun", () => {
  const [lng, lat] = [100.56, 13.74];

  it("stands high in the south at noon in December and in the north in June", () => {
    const december = sunPosition(bangkokTimestamp("2026-12-21", 12.2), lat, lng);
    expect(december.altitudeDeg).toBeCloseTo(90 - lat - 23.44, 0);
    expect(Math.abs(december.azimuthDeg - 180)).toBeLessThan(8);
    const june = sunPosition(bangkokTimestamp("2026-06-21", 12.3), lat, lng);
    expect(june.azimuthDeg < 30 || june.azimuthDeg > 330).toBe(true);
  });

  it("rises in the east and sets in the west", () => {
    const morning = sunPosition(bangkokTimestamp("2026-03-20", 7), lat, lng);
    const evening = sunPosition(bangkokTimestamp("2026-03-20", 17.5), lat, lng);
    expect(morning.azimuthDeg).toBeGreaterThan(80);
    expect(morning.azimuthDeg).toBeLessThan(100);
    expect(evening.azimuthDeg).toBeGreaterThan(260);
    expect(evening.azimuthDeg).toBeLessThan(280);
    expect(sunPosition(bangkokTimestamp("2026-03-20", 22), lat, lng).altitudeDeg).toBeLessThan(0);
  });

  it("lights the scene by phase, and the light travels away from the sun", () => {
    const sun = sunPosition(bangkokTimestamp("2026-11-19", 16), lat, lng);
    const day = sceneLighting(sun, false);
    expect(day.phase === "day" || day.phase === "golden").toBe(true);
    expect(day.sun.direction[2]).toBeLessThan(0);
    // An afternoon sun in the south-west: light travels north-east.
    expect(day.sun.direction[0]).toBeGreaterThan(0);
    expect(sceneLighting({ azimuthDeg: 250, altitudeDeg: -5 }, false).phase).toBe("dusk");
    expect(sceneLighting(sun, true).phase).toBe("night");
    expect(formatHour(18.5)).toBe("18:30");
  });

  it("casts the ground shadow away from the sun", () => {
    const design = tower();
    const ring = groundShadow(design, { azimuthDeg: 270, altitudeDeg: 30 });
    expect(ring).not.toBeNull();
    const lngs = (ring ?? []).map((p) => p[0]);
    const footprint = (design.floors[0]?.outline[0] ?? []).map((p) => p[0]);
    // Sun in the west: the shadow reaches well east of the footprint.
    expect(Math.max(...lngs)).toBeGreaterThan(Math.max(...footprint) + 0.0005);
    expect(groundShadow(design, { azimuthDeg: 270, altitudeDeg: 2 })).toBeNull();
  });
});

describe("as built", () => {
  it("estimates floor area from the on-plot footprint and storeys of 3.5 m", () => {
    const summary = asBuiltSummary([
      { id: "a", footprintM2: 900, overlapM2: 400, heightM: 35, baseM: 0 },
      { id: "b", footprintM2: 200, overlapM2: 100, heightM: 3, baseM: 0 },
      { id: "c", footprintM2: 300, overlapM2: 50, heightM: 70, baseM: 35 },
    ]);
    expect(summary.footprintM2).toBe(500);
    expect(summary.estimatedFloorAreaM2).toBe(400 * 10 + 100 * 1 + 50 * 10);
    expect(summary.heightM).toBe(70);
  });
});

describe("geometry helpers", () => {
  it("merges near-collinear runs into one edge with an outward normal", () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 5, y: 0.05 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const edges = ringEdges(ring);
    expect(edges).toHaveLength(4);
    expect(edges[0]?.normal.y).toBeCloseTo(-1);
  });

  it("gives stable numbers for the same inputs", () => {
    expect(hash01(1, 2, 3)).toBe(hash01(1, 2, 3));
    expect(hash01(1, 2, 3)).not.toBe(hash01(3, 2, 1));
  });
});

describe("floor selection", () => {
  it("is cleared when another design is chosen", () => {
    useResultsView.getState().selectDesign("podium-tower", "highRise");
    useResultsView.getState().setSelectedFloor(4);
    expect(useResultsView.getState().selectedFloor).toBe(4);
    useResultsView.getState().selectDesign("midrise", "lowRise");
    expect(useResultsView.getState().selectedFloor).toBeNull();
  });
});
