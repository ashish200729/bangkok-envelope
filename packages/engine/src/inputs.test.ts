import { describe, expect, it } from "vitest";
import { SAMPLE_INPUT } from "./fixtures";
import { closeRing } from "./geo";
import { type EngineInput, engineInputSchema } from "./inputs";
import { formatCitation } from "./law";

function sample(): EngineInput {
  return JSON.parse(JSON.stringify(SAMPLE_INPUT)) as EngineInput;
}

function issues(input: unknown) {
  const result = engineInputSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

describe("engineInputSchema", () => {
  it("accepts the sample input unchanged", () => {
    const result = engineInputSchema.safeParse(SAMPLE_INPUT);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(SAMPLE_INPUT);
  });

  it("rejects a plot with fewer than three vertices", () => {
    const input = sample();
    input.plot.vertices = input.plot.vertices.slice(0, 2);
    input.plot.edges = input.plot.edges.slice(0, 2);
    expect(issues(input).map((i) => i.path)).toContain("plot.vertices");
  });

  it("rejects an edge list that does not match the vertex count", () => {
    const input = sample();
    input.plot.edges = input.plot.edges.slice(0, 4);
    expect(issues(input)).toContainEqual({
      path: "plot.edges",
      message: "Expected one edge per vertex (5), got 4",
    });
  });

  it("rejects a closed ring so edge indices stay unambiguous", () => {
    const input = sample();
    const first = input.plot.vertices[0];
    if (!first) throw new Error("sample has vertices");
    input.plot.vertices = [...input.plot.vertices, first];
    input.plot.edges = [...input.plot.edges, { kind: "boundary" }];
    expect(issues(input).map((i) => i.path)).toContain("plot.vertices");
  });

  it("rejects an edge that points at a road that does not exist", () => {
    const input = sample();
    input.plot.edges[2] = { kind: "road", roadId: "ghost" };
    expect(issues(input)).toContainEqual({
      path: "plot.edges.2.roadId",
      message: 'Edge 2 faces road "ghost", which is not in roads',
    });
  });

  it("rejects duplicate road ids", () => {
    const input = sample();
    const road = input.roads[0];
    if (!road) throw new Error("sample has a road");
    input.roads = [road, { ...road }];
    expect(issues(input).map((i) => i.path)).toContain("roads.1.id");
  });

  it.each([
    ["a zero road width", (i: EngineInput) => ((i.roads[0] as { widthM: number }).widthM = 0)],
    ["a bonus above 20%", (i: EngineInput) => (i.farBonusPct = 21)],
    ["an unknown zone", (i: EngineInput) => ((i as { zone: string }).zone = "Y7")],
    [
      "an unknown building type",
      (i: EngineInput) => ((i as { buildingType: string }).buildingType = "mall"),
    ],
    ["a negative station distance", (i: EngineInput) => (i.site.stationDistanceM = -1)],
    ["a latitude out of range", (i: EngineInput) => (i.plot.vertices[0] = [100.5, 91])],
    ["a NaN coordinate", (i: EngineInput) => (i.plot.vertices[1] = [Number.NaN, 13.7])],
    ["an infinite coordinate", (i: EngineInput) => (i.plot.vertices[1] = [Infinity, 13.7])],
  ])("rejects %s", (_name, mutate) => {
    const input = sample();
    mutate(input);
    expect(engineInputSchema.safeParse(input).success).toBe(false);
  });

  it("accepts an unknown station distance", () => {
    const input = sample();
    input.site.stationDistanceM = null;
    expect(engineInputSchema.safeParse(input).success).toBe(true);
  });
});

describe("closeRing", () => {
  it("repeats the first vertex once at the end", () => {
    const ring = closeRing(SAMPLE_INPUT.plot.vertices);
    expect(ring).toHaveLength(SAMPLE_INPUT.plot.vertices.length + 1);
    expect(ring.at(-1)).toEqual(ring[0]);
    expect(closeRing(ring)).toBe(ring);
  });
});

describe("formatCitation", () => {
  it("names the law and clause", () => {
    expect(formatCitation({ law: "bkk-plan-2556", clause: "17" })).toBe("2013 plan, cl. 17");
  });
});
