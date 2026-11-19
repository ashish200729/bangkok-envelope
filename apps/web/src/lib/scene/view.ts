import { create } from "zustand";
import { bangkokTimestamp } from "./sun";

/** Daylight is a fixed Bangkok afternoon: soft shadows that show the massing (decision 62). */
export const DAYLIGHT_HOUR = 15;

function todayInBangkok(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

type SceneView = {
  /** Bangkok calendar date, "YYYY-MM-DD": today, for the sun's position. */
  date: string;
  /** Decimal hour, Bangkok time; always `DAYLIGHT_HOUR`. */
  hour: number;
  /** Night view: a dark scene with lit windows, whatever the hour. */
  night: boolean;
  /** Map toggles. */
  layers: SceneToggles;
};

export type SceneToggles = {
  /** The setback band along each road, with distances. */
  setback: boolean;
  /** The allowed envelope (with the road height plane) as a ghost around a design. */
  heightLimit: boolean;
  /** The building standing on the plot today, ghosted; hidden by default. */
  asBuilt: boolean;
  /** Surrounding buildings faded, for a plot hidden behind towers. */
  seeThrough: boolean;
};

type SceneViewActions = {
  setLayer: (layer: keyof SceneToggles, on: boolean) => void;
  setNight: (night: boolean) => void;
};

/** How the 3D scene is lit and what it shows. Separate from the results view: no numbers change. */
export const useSceneView = create<SceneView & SceneViewActions>()((set) => ({
  date: todayInBangkok(),
  hour: DAYLIGHT_HOUR,
  night: false,
  layers: { setback: true, heightLimit: true, asBuilt: false, seeThrough: false },
  setLayer: (layer, on) => set((s) => ({ layers: { ...s.layers, [layer]: on } })),
  setNight: (night) => set({ night }),
}));

export function sceneTimestamp(view: Pick<SceneView, "date" | "hour">): number {
  return bangkokTimestamp(view.date, view.hour);
}
