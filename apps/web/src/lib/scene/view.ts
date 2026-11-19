import { create } from "zustand";
import { bangkokTimestamp } from "./sun";

export const SUN_PRESETS = [
  { label: "9:00", hour: 9 },
  { label: "12:00", hour: 12 },
  { label: "16:00", hour: 16 },
  { label: "18:30", hour: 18.5 },
] as const;
export const SUN_HOUR_MIN = 6;
export const SUN_HOUR_MAX = 19;

function todayInBangkok(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

type SceneView = {
  /** Bangkok calendar date, "YYYY-MM-DD". */
  date: string;
  /** Decimal hour, Bangkok time. */
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
};

type SceneViewActions = {
  setLayer: (layer: keyof SceneToggles, on: boolean) => void;
  setDate: (date: string) => void;
  setHour: (hour: number) => void;
  setNight: (night: boolean) => void;
};

/** How the 3D scene is lit and what it shows. Separate from the results view: no numbers change. */
export const useSceneView = create<SceneView & SceneViewActions>()((set) => ({
  date: todayInBangkok(),
  hour: 15,
  night: false,
  layers: { setback: true, heightLimit: true, asBuilt: false },
  setLayer: (layer, on) => set((s) => ({ layers: { ...s.layers, [layer]: on } })),
  setDate: (date) => set(/^\d{4}-\d{2}-\d{2}$/.test(date) ? { date } : {}),
  setHour: (hour) => set({ hour: Math.min(SUN_HOUR_MAX, Math.max(SUN_HOUR_MIN, hour)) }),
  setNight: (night) => set({ night }),
}));

export function sceneTimestamp(view: Pick<SceneView, "date" | "hour">): number {
  return bangkokTimestamp(view.date, view.hour);
}
