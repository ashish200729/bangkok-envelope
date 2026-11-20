import { describe, expect, it } from "vitest";
import { inlineTileJson, tilesAround } from "./basemap-prefetch";

const style = {
  version: 8,
  sources: {
    openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
    ne2_shaded: { type: "raster", tiles: ["x"] },
  },
};
const tileJson = {
  tiles: ["https://tiles.openfreemap.org/planet/v1/{z}/{x}/{y}.pbf"],
  minzoom: 0,
  maxzoom: 14,
  attribution: "© OpenMapTiles",
};

describe("basemap prefetch", () => {
  it("finds the z14 tile under the sample plot, the one MapLibre asks for", () => {
    expect(tilesAround([100.5624, 13.7421])).toEqual([[12768, 7560]]);
  });

  it("adds the neighbouring tile when the point sits near an edge", () => {
    // x = 12768.0x: just past the western edge of the tile.
    const lng = (12768.05 / 2 ** 14) * 360 - 180;
    expect(tilesAround([lng, 13.7421])).toEqual([
      [12768, 7560],
      [12767, 7560],
    ]);
  });

  it("inlines the tile index and keeps every other source as it was", () => {
    const out = inlineTileJson(style, tileJson);
    expect(out?.sources.openmaptiles).toEqual({
      type: "vector",
      tiles: tileJson.tiles,
      minzoom: 0,
      maxzoom: 14,
      attribution: "© OpenMapTiles",
    });
    expect(out?.sources.ne2_shaded).toBe(style.sources.ne2_shaded);
  });

  it("falls back to the style URL when the style changes shape", () => {
    expect(inlineTileJson({ sources: {} }, tileJson)).toBeNull();
    const moved = { sources: { openmaptiles: { type: "vector", url: "https://elsewhere/x" } } };
    expect(inlineTileJson(moved, tileJson)).toBeNull();
    expect(inlineTileJson(style, { tiles: [] })).toBeNull();
  });
});
