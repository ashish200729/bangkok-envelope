import type { FloorUse } from "@envelope/engine";
import { USE_RGB } from "@/lib/results/designs";

export type Rgb = readonly [number, number, number];

/** deck.gl wants RGB arrays; colours are written as hex, like the rest of the map's colours. */
export function rgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return a.map((c, i) => Math.round(c + ((b[i] ?? c) - c) * t)) as unknown as Rgb;
}

/** Blend towards white (t > 0) or black (t < 0). */
export function shade(color: Rgb, t: number): Rgb {
  const target = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  return color.map((c) => Math.round(c + (target - c) * k)) as unknown as Rgb;
}

export type Facade = {
  /** The opaque band between floor lines: the use colour. */
  wall: Rgb;
  /** The thin floor line at each storey. */
  line: Rgb;
  /** A quiet window rhythm along each façade edge; null for a blank face. */
  windows: {
    spacingM: number;
    /** Pane width as a share of the bay (1 = wall-to-wall glass). */
    widthShare: number;
    /** Pane height and sill as shares of the band height. */
    heightShare: number;
    sillShare: number;
    glass: Rgb;
    /** Share of panes lit at night. */
    litShare: number;
  } | null;
};

type Rhythm = Omit<NonNullable<Facade["windows"]>, "glass">;

const PUNCHED: Rhythm = {
  spacingM: 3.6,
  widthShare: 0.52,
  heightShare: 0.58,
  sillShare: 0.22,
  litShare: 0.7,
};
const HOTEL: Rhythm = { ...PUNCHED, spacingM: 3.2, widthShare: 0.46 };
const CURTAIN: Rhythm = {
  spacingM: 3,
  widthShare: 0.94,
  heightShare: 0.9,
  sillShare: 0.05,
  litShare: 0.7,
};
const SHOPFRONT: Rhythm = { ...CURTAIN, spacingM: 2.8, litShare: 1 };

const RHYTHM: Record<FloorUse, Rhythm | null> = {
  residential: PUNCHED,
  hotel: HOTEL,
  office: CURTAIN,
  lobby: SHOPFRONT,
  retail: SHOPFRONT,
  amenity: SHOPFRONT,
  parking: null,
};

/** Windows are a slightly darker tone of the use colour: detail you notice close up, not noise. */
const GLASS_SHADE = -0.06;
const LINE_SHADE = 0.38;
/** A cool tint, so panes read as glazing rather than brick. */
const GLASS_TINT: Rgb = [120, 146, 170];

export const FACADES = Object.fromEntries(
  (Object.keys(USE_RGB) as FloorUse[]).map((use) => {
    const wall = USE_RGB[use];
    const rhythm = RHYTHM[use];
    const facade: Facade = {
      wall,
      line: shade(wall, LINE_SHADE),
      windows: rhythm
        ? { ...rhythm, glass: mix(shade(wall, GLASS_SHADE), GLASS_TINT, 0.22) }
        : null,
    };
    return [use, facade];
  }),
) as Record<FloorUse, Facade>;

export const SCENE_COLORS = {
  parapet: rgb("#ece9e4"),
  roof: rgb("#e4e1dc"),
  /** Plant room and lift core on the roof: darker grey, as in a concept study. */
  core: rgb("#8f949a"),
  litWindow: rgb("#ffaa46"),
  darkWindow: rgb("#29313b"),
  edge: rgb("#4a4f57"),
  /** The plot's ground and the buildable area inside the setbacks. */
  plotGround: rgb("#e9e7e1"),
  lawn: rgb("#c9d6bb"),
  setbackBand: rgb("#e8796c"),
  trunk: rgb("#8a7a68"),
  canopy: [rgb("#9db58c"), rgb("#a8bd95"), rgb("#93ad83")] as const,
  highlight: rgb("#f5a524"),
  hover: rgb("#ffffff"),
  asBuilt: "#d98b3a",
} as const;
