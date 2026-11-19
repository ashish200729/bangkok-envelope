import { describe, expect, it } from "vitest";
import type { VertexId } from "@/lib/plot/draft";
import {
  currentContext,
  IDLE,
  reduceSiteRequest,
  type SiteContext,
  type SiteRequest,
} from "./request";

const context: SiteContext = {
  sideIds: ["a" as VertexId],
  matches: new Map(),
  nearestStation: { name: "อโศก", nameEn: "Asok", network: null, distanceM: 129 },
};

const run = (...events: Parameters<typeof reduceSiteRequest>[1][]) =>
  events.reduce<SiteRequest>(reduceSiteRequest, IDLE);

describe("reduceSiteRequest", () => {
  it("goes from idle through loading to ready", () => {
    expect(run({ type: "start" })).toEqual({ status: "loading", last: null });
    expect(run({ type: "start" }, { type: "loaded", context })).toEqual({
      status: "ready",
      context,
    });
  });

  it("keeps the last result on screen while the next one loads", () => {
    const state = run({ type: "start" }, { type: "loaded", context }, { type: "start" });
    expect(state).toEqual({ status: "loading", last: context });
    expect(currentContext(state)).toBe(context);
    expect(currentContext(reduceSiteRequest(state, { type: "start" }))).toBe(context);
  });

  it("reports plots outside the study area and failures without old data", () => {
    const outside = run({ type: "loaded", context }, { type: "start" }, { type: "outside" });
    expect(outside).toEqual({ status: "outside-area" });
    expect(currentContext(outside)).toBeNull();
    const failed = run({ type: "loaded", context }, { type: "failed", message: "Nope" });
    expect(failed).toEqual({ status: "error", message: "Nope" });
    expect(currentContext(failed)).toBeNull();
  });

  it("recovers from an error on retry", () => {
    const state = run({ type: "failed", message: "Nope" }, { type: "start" });
    expect(state).toEqual({ status: "loading", last: null });
  });
});
