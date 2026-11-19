import {
  type EngineInput,
  type Envelope,
  type Floor,
  type FloorUse,
  type LngLat,
  makeProjection,
} from "@envelope/engine";
import { outlinePolygons } from "@/lib/results/designs";

/**
 * A section through the building as seen from its main road: every floor as a band from its
 * bottom to its top, as wide as the floor reaches along the road. Both axes are metres at one
 * scale, so the drawing is to scale.
 */
export type SectionBand = {
  level: number;
  use: FloorUse;
  /** Along the road, metres from the plot's first point on the axis. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  areaM2: number;
  /** Nothing of this floor is left after cutting it (drawn as an outline). */
  empty: boolean;
};

/** Consecutive floors of one use, labelled together: "18 × Office · 37,656 m²". */
export type SectionGroup = {
  start: number;
  end: number;
  use: FloorUse;
  count: number;
  areaM2: number;
  z0: number;
  z1: number;
};

export type SectionStep = { x0: number; x1: number; z0: number; z1: number };

export type SectionModel = {
  bands: SectionBand[];
  groups: SectionGroup[];
  /** The plot's extent along the road: the ground line. */
  ground: { x0: number; x1: number };
  heightM: number;
  /** The allowed envelope's outline along the road, one step per slice. */
  envelope: SectionStep[];
};

type Axis = { ux: number; uy: number };

/** Unit vector along the longest road side, or the plot's longest side when none faces a road. */
export function sectionAxis(input: EngineInput): Axis {
  const projection = makeProjection(input.plot.vertices[0] as LngLat);
  const points = input.plot.vertices.map(projection.toLocal);
  let best: { length: number; axis: Axis; road: boolean } | null = null;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    const road = input.plot.edges[i]?.kind === "road";
    if (!best || (road && !best.road) || (road === best.road && length > best.length)) {
      best = { length, axis: { ux: dx / length, uy: dy / length }, road };
    }
  }
  return best?.axis ?? { ux: 1, uy: 0 };
}

function extent(points: readonly LngLat[], toU: (p: LngLat) => number) {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    const u = toU(p);
    if (u < lo) lo = u;
    if (u > hi) hi = u;
  }
  return lo <= hi ? { lo, hi } : null;
}

export function sectionModel(
  input: EngineInput,
  floors: readonly Floor[],
  envelope: Envelope | null = null,
): SectionModel {
  const origin = input.plot.vertices[0] as LngLat;
  const projection = makeProjection(origin);
  const axis = sectionAxis(input);
  const toU = (p: LngLat) => {
    const { x, y } = projection.toLocal(p);
    return x * axis.ux + y * axis.uy;
  };
  const plot = extent(input.plot.vertices, toU) ?? { lo: 0, hi: 1 };
  const shift = (u: number) => u - plot.lo;

  const bands: SectionBand[] = [];
  let lastSpan: { x0: number; x1: number } = { x0: 0, x1: plot.hi - plot.lo };
  for (const floor of floors) {
    const points = outlinePolygons(floor.outline).flat(2);
    const span = floor.areaM2 > 0 ? extent(points, toU) : null;
    const x = span ? { x0: shift(span.lo), x1: shift(span.hi) } : lastSpan;
    if (span) lastSpan = x;
    bands.push({
      level: floor.level,
      use: floor.use,
      ...x,
      z0: floor.z0M,
      z1: floor.z0M + floor.heightM,
      areaM2: floor.areaM2,
      empty: !span,
    });
  }

  const groups: SectionGroup[] = [];
  for (const band of bands) {
    const last = groups[groups.length - 1];
    if (last && last.use === band.use && last.end === band.level - 1) {
      last.end = band.level;
      last.count += 1;
      last.areaM2 += band.areaM2;
      last.z1 = band.z1;
    } else {
      groups.push({
        start: band.level,
        end: band.level,
        use: band.use,
        count: 1,
        areaM2: band.areaM2,
        z0: band.z0,
        z1: band.z1,
      });
    }
  }

  const steps: SectionStep[] = [];
  for (const slice of envelope?.slices ?? []) {
    const span = extent(slice.footprint.flat(2), toU);
    if (span) steps.push({ x0: shift(span.lo), x1: shift(span.hi), z0: slice.z0M, z1: slice.z1M });
  }

  return {
    bands,
    groups,
    ground: { x0: 0, x1: plot.hi - plot.lo },
    heightM: bands[bands.length - 1]?.z1 ?? 0,
    envelope: steps,
  };
}

export type SectionLayout = {
  width: number;
  height: number;
  /** Pixels per metre, the same both ways. */
  scale: number;
  /** Screen x of x = 0 and screen y of the ground. */
  left: number;
  groundY: number;
  /** Label positions: `y` is where the text sits, `anchorY` the middle of its floors. */
  labels: { group: SectionGroup; y: number; anchorY: number }[];
  labelX: number;
};

export type LayoutOptions = {
  width: number;
  height: number;
  labelWidth: number;
  padding: number;
  /** Room above the roof for the height mark. */
  topRoom: number;
  /** Smallest gap between two label lines. */
  lineGap: number;
};

/** Places labels so none overlap: each sits at its floors' middle, nudged apart where crowded. */
export function spreadLabels(wanted: readonly number[], gap: number, min: number, max: number) {
  const ys = [...wanted];
  for (let i = 1; i < ys.length; i++) {
    const prev = ys[i - 1] as number;
    if ((ys[i] as number) > prev - gap) ys[i] = prev - gap;
  }
  // Labels run bottom (large y) to top; push the stack back down if it left the top.
  const overflow = min - (ys[ys.length - 1] ?? min);
  if (overflow > 0) {
    for (let i = ys.length - 1; i >= 0; i--) {
      const next = ys[i + 1];
      const target = (ys[i] as number) + overflow;
      ys[i] = next === undefined ? target : Math.max(target, next + gap);
    }
  }
  return ys.map((y) => Math.min(max, y));
}

export function layoutSection(model: SectionModel, options: LayoutOptions): SectionLayout {
  const { width, height, labelWidth, padding, topRoom, lineGap } = options;
  const drawingWidth = Math.max(1, width - labelWidth - padding * 2);
  const envelopeTop = model.envelope.reduce((top, s) => Math.max(top, s.z1), 0);
  const spanZ = Math.max(model.heightM, Math.min(envelopeTop, model.heightM * 1.25), 1);
  const xs = [model.ground.x0, model.ground.x1, ...model.bands.flatMap((b) => [b.x0, b.x1])];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const spanX = Math.max(1, maxX - minX);
  const scale = Math.min(drawingWidth / spanX, (height - padding * 2 - topRoom) / spanZ);
  const left = padding + (drawingWidth - spanX * scale) / 2 - minX * scale;
  const groundY = height - padding;
  const toY = (z: number) => groundY - z * scale;
  const anchors = model.groups.map((g) => toY((g.z0 + g.z1) / 2));
  const ys = spreadLabels(anchors, lineGap, padding + lineGap / 2, groundY - 2);
  return {
    width,
    height,
    scale,
    left,
    groundY,
    labels: model.groups.map((group, i) => ({
      group,
      y: ys[i] as number,
      anchorY: anchors[i] as number,
    })),
    labelX: width - labelWidth - padding / 2 + 8,
  };
}
