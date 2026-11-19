/**
 * Map colours as hex, because MapLibre and Terra Draw do not parse the theme's OKLCH tokens.
 * They match the "Blueprint" theme in packages/ui/src/styles/globals.css.
 */
export const MAP_COLORS = {
  primary: "#1f5aa6",
  primaryLight: "#6fa3e0",
  plotFill: "#3b7bd1",
  road: "#1f5aa6",
  active: "#d68a00",
  activeFill: "#fdf0d2",
  boundaryLabel: "#5c5249",
  ink: "#1d1713",
  pillBorder: "#d9d4ce",
  fail: "#d02c2a",
  halo: "#ffffff",
  white: "#ffffff",
} as const;

export const MAP_FONT = ["Noto Sans Bold"];
