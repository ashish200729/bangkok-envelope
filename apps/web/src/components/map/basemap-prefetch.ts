import type { LngLat } from "@envelope/engine";

/**
 * Starts the basemap downloads as soon as the page runs, instead of after the map bundle has
 * loaded: the style, its tile index, the vector tile under the plot, the sprite and the label
 * fonts. They used to happen one after another behind the 490 KB map bundle (decision 65).
 * MapLibre then finds them in the browser's HTTP cache, or joins the download still in flight.
 *
 * No MapLibre import here: this module is part of the page bundle and must stay small.
 */
export const TILES_ORIGIN = "https://tiles.openfreemap.org";
export const STYLE_URL = `${TILES_ORIGIN}/styles/liberty`;
/** Liberty's only vector source. Fetched in parallel with the style, checked against it below. */
const TILEJSON_URL = `${TILES_ORIGIN}/planet`;
/** The vector tiles stop at z14; closer views cut their tiles from the z14 one. */
const TILE_ZOOM = 14;
/** Fonts Liberty's labels use. Latin glyphs come from the server; Thai is drawn locally. */
const FONTS = ["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"];

type StyleJson = {
  sources: Record<string, { type: string; url?: string; [key: string]: unknown }>;
  sprite?: unknown;
  glyphs?: string;
  [key: string]: unknown;
};
type TileJson = {
  tiles: string[];
  minzoom?: number;
  maxzoom?: number;
  bounds?: number[];
  attribution?: string;
};

let started: Promise<StyleJson | null> | null = null;
let resolved: StyleJson | null = null;

const get = (url: string) => fetch(url, { credentials: "same-origin" });
const getJson = async <T>(url: string): Promise<T> => {
  const response = await get(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return (await response.json()) as T;
};
/** Fire and forget: only the HTTP cache needs the body. */
const warm = (url: string) => {
  get(url)
    .then((r) => r.arrayBuffer())
    .catch(() => {});
};

/** z14 tiles under a point, plus the neighbour when the point is near a tile edge. */
export function tilesAround([lng, lat]: LngLat, zoom = TILE_ZOOM): [number, number][] {
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const dx = x - tx < 0.2 ? -1 : x - tx > 0.8 ? 1 : 0;
  const dy = y - ty < 0.2 ? -1 : y - ty > 0.8 ? 1 : 0;
  const tiles: [number, number][] = [[tx, ty]];
  if (dx) tiles.push([tx + dx, ty]);
  if (dy) tiles.push([tx, ty + dy]);
  if (dx && dy) tiles.push([tx + dx, ty + dy]);
  return tiles;
}

/**
 * Inlines the tile index into the style, so MapLibre requests tiles without another round trip
 * for the index. Returns null when the style no longer has the source this expects.
 */
export function inlineTileJson(style: StyleJson, tileJson: TileJson): StyleJson | null {
  const source = style.sources.openmaptiles;
  if (source?.type !== "vector" || source.url !== TILEJSON_URL || !tileJson.tiles?.length) {
    return null;
  }
  const { url: _url, ...rest } = source;
  return {
    ...style,
    sources: {
      ...style.sources,
      openmaptiles: {
        ...rest,
        tiles: tileJson.tiles,
        minzoom: tileJson.minzoom ?? 0,
        maxzoom: tileJson.maxzoom ?? TILE_ZOOM,
        ...(tileJson.bounds ? { bounds: tileJson.bounds } : {}),
        ...(tileJson.attribution ? { attribution: tileJson.attribution } : {}),
      },
    },
  };
}

/** Starts every download once; later calls return the same promise. Browser only. */
export function prefetchBasemap(centre: LngLat): Promise<StyleJson | null> {
  if (started) return started;
  // Two independent chains: the tile under the plot needs only the tile index, the sprite and
  // fonts only the style.
  const tileJsonReady = getJson<TileJson>(TILEJSON_URL).then((tileJson) => {
    const template = tileJson.tiles?.[0];
    if (template) {
      for (const [x, y] of tilesAround(centre)) {
        warm(
          template
            .replace("{z}", String(TILE_ZOOM))
            .replace("{x}", String(x))
            .replace("{y}", String(y)),
        );
      }
    }
    return tileJson;
  });
  const styleReady = getJson<StyleJson>(STYLE_URL).then((style) => {
    if (typeof style.sprite === "string") {
      const scale = window.devicePixelRatio > 1 ? "@2x" : "";
      warm(`${style.sprite}${scale}.json`);
      warm(`${style.sprite}${scale}.png`);
    }
    if (style.glyphs) {
      for (const font of FONTS) {
        warm(
          style.glyphs.replace("{fontstack}", encodeURIComponent(font)).replace("{range}", "0-255"),
        );
      }
    }
    return style;
  });
  started = Promise.all([styleReady, tileJsonReady]).then(
    ([style, tileJson]) => {
      resolved = inlineTileJson(style, tileJson);
      return resolved;
    },
    () => null,
  );
  return started;
}

/** The ready style with its tiles inlined, or the style URL while it is still downloading. */
export function basemapStyle(): StyleJson | string {
  return resolved ?? STYLE_URL;
}
