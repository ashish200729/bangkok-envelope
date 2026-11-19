import type { XY } from "@envelope/engine";

/**
 * Picks the camera angle from which neighbouring buildings hide the least of the plot. Local
 * metres, x east, y north, origin anywhere. A camera at MapLibre bearing b looks toward b, so it
 * stands on the opposite side (b + 180°) of the plot; at pitch p its line of sight drops at
 * (90° − p) from the horizontal. A building d metres from the plot on the camera's side hides
 * the ground beside the plot when it is taller than d × tan(90° − p); what pokes above that line
 * is its "excess", weighted by its width.
 */
export type Obstacle = { centre: XY; radiusM: number; heightM: number };
export type ViewAngle = { bearing: number; pitch: number };
export type ScoredView = ViewAngle & { score: number };

export const VIEW_PITCHES = [55, 45, 35] as const;
const BEARING_STEP = 15;
/** Beyond this, a neighbour is out of frame for a plot-sized view. */
const REACH_M = 220;
/**
 * Tie-breakers: a steeper (more top-down) view or a turn away from the preferred bearing costs a
 * little, so the usual angle stays unless another is clearly clearer.
 */
const PITCH_COST = 0.004;
const TURN_COST = 0.001;

const toRad = (deg: number) => (deg * Math.PI) / 180;
/** Compass bearing of a vector: 0 north, 90 east. */
const compass = (x: number, y: number) => ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
const angleBetween = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export function plotCircle(ring: readonly XY[]): { centre: XY; radiusM: number } {
  const n = ring.length || 1;
  const centre: XY = {
    x: ring.reduce((s, p) => s + p.x, 0) / n,
    y: ring.reduce((s, p) => s + p.y, 0) / n,
  };
  const radiusM = Math.max(1, ...ring.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y)));
  return { centre, radiusM };
}

/** How much the obstacles hide the plot from this angle; 0 is a clear view. */
export function occlusion(
  plot: { centre: XY; radiusM: number },
  obstacles: readonly Obstacle[],
  { bearing, pitch }: ViewAngle,
): number {
  const cameraSide = (bearing + 180) % 360;
  const slope = Math.tan(toRad(90 - pitch));
  let score = 0;
  for (const o of obstacles) {
    const dx = o.centre.x - plot.centre.x;
    const dy = o.centre.y - plot.centre.y;
    const centreDistance = Math.hypot(dx, dy);
    const gap = centreDistance - plot.radiusM - o.radiusM;
    if (centreDistance > REACH_M + plot.radiusM) continue;
    // The sector, seen from the plot's centre, that the plot and this building's width span.
    const halfWidth =
      (Math.atan2(plot.radiusM + o.radiusM, Math.max(1, centreDistance)) * 180) / Math.PI;
    if (angleBetween(compass(dx, dy), cameraSide) > halfWidth) continue;
    const excess = o.heightM - Math.max(0, gap) * slope;
    if (excess > 0) score += excess * o.radiusM;
  }
  return score / (plot.radiusM * plot.radiusM);
}

/**
 * The clearest of every bearing (15° steps) at each pitch in `VIEW_PITCHES`, preferring the
 * usual 55° pitch and the bearing asked for when views are about as clear.
 */
export function clearestView(
  ring: readonly XY[],
  obstacles: readonly Obstacle[],
  preferred: ViewAngle,
): ScoredView {
  const plot = plotCircle(ring);
  let best: ScoredView | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const pitch of VIEW_PITCHES) {
    for (let step = 0; step < 360 / BEARING_STEP; step++) {
      const bearing = (preferred.bearing + step * BEARING_STEP) % 360;
      const score = occlusion(plot, obstacles, { bearing, pitch });
      const cost =
        score +
        PITCH_COST * (preferred.pitch - pitch) +
        TURN_COST * angleBetween(bearing, preferred.bearing);
      if (cost < bestCost) {
        bestCost = cost;
        best = { bearing, pitch, score };
      }
    }
  }
  return best ?? { ...preferred, score: 0 };
}
