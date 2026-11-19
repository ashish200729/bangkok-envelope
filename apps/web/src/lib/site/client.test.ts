import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPlotContext, SITE_ERROR_MESSAGE } from "./client";

const PLOT = [
  [100.56, 13.74],
  [100.561, 13.74],
  [100.561, 13.741],
] as const;

function answer(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

const ask = () => fetchPlotContext([...PLOT], new AbortController().signal);

afterEach(() => vi.unstubAllGlobals());

describe("fetchPlotContext", () => {
  it("reports a plot too large to look up as no site data, not as a failure to retry", async () => {
    answer(400, { error: { code: "plot_too_large", message: "…", requestId: "r" } });
    expect(await ask()).toEqual({ kind: "no-data", reason: "too-large" });
  });

  it("reports a plot outside the study area as no site data", async () => {
    answer(200, { insideStudyArea: false, nearestStation: null, sides: [] });
    expect(await ask()).toEqual({ kind: "no-data", reason: "outside-area" });
  });

  it("reports other errors as failures", async () => {
    answer(429, { error: { code: "rate_limited", message: "…", requestId: "r" } });
    expect(await ask()).toEqual({ kind: "failed", message: SITE_ERROR_MESSAGE });
    answer(500, "not json at all");
    expect(await ask()).toEqual({ kind: "failed", message: SITE_ERROR_MESSAGE });
  });
});
