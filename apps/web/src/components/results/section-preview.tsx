"use client";

import { type EngineInput, type Envelope, LAW, USE_LABEL } from "@envelope/engine";
import { cn } from "@envelope/ui/lib/utils";
import { type KeyboardEvent, type MouseEvent, useId, useMemo } from "react";
import { floorUseColor } from "@/lib/results/designs";
import { formatArea, formatLength } from "@/lib/results/format";
import type { AnyDesign } from "@/lib/results/view";
import type { ClickModifiers } from "@/lib/studio/floors";
import { layoutSection, type SectionGroup, sectionModel } from "@/lib/studio/section";

const WIDTH = 380;
const LABEL_WIDTH = 168;
const PADDING = 14;
const PLANT_M = 2.5;

export function groupLabel(group: SectionGroup): string {
  return `${group.count} × ${USE_LABEL[group.use]}`;
}

const modifiersOf = (e: MouseEvent | KeyboardEvent): ClickModifiers => ({
  shift: e.shiftKey,
  toggle: e.metaKey || e.ctrlKey,
});

/**
 * The building in section, to scale, as seen from its main road: floors as bands coloured by
 * use, runs of one use labelled on the right, the height at the top and the allowed envelope
 * dashed behind. Clicking a band or a label selects those floors.
 */
export function SectionPreview({
  design,
  input,
  envelope,
  selected = [],
  breaches = [],
  onSelect,
  height = 300,
  className,
}: {
  design: AnyDesign;
  input: EngineInput;
  envelope: Envelope | null;
  selected?: readonly number[];
  breaches?: readonly number[];
  onSelect?: (levels: number[], modifiers: ClickModifiers) => void;
  height?: number;
  className?: string;
}) {
  const hatch = useId();
  const model = useMemo(
    () => sectionModel(input, design.floors, envelope),
    [input, design.floors, envelope],
  );
  const layout = useMemo(
    () =>
      layoutSection(model, {
        width: WIDTH,
        height,
        labelWidth: LABEL_WIDTH,
        padding: PADDING,
        topRoom: 26,
        lineGap: 15,
      }),
    [model, height],
  );
  const { scale, left, groundY } = layout;
  const x = (m: number) => left + m * scale;
  const y = (z: number) => groundY - z * scale;
  const chosen = new Set(selected);
  const breached = new Set(breaches);
  const top = model.bands.findLast((b) => !b.empty);
  const leftEdge = Math.min(...model.bands.map((b) => x(b.x0)), x(model.ground.x0));
  const buildingRight = Math.max(...model.bands.map((b) => x(b.x1)), x(model.ground.x1));
  const threshold = LAW.highRiseThresholdM.value;
  const showThreshold = model.heightM > threshold * 0.6 && y(threshold) > PADDING;

  const envelopePath = model.envelope
    .map((s) => `M${x(s.x0)},${y(s.z0)} V${y(s.z1)} M${x(s.x1)},${y(s.z0)} V${y(s.z1)}`)
    .join(" ");
  const envelopeTops = model.envelope
    .map((s, i) => {
      const next = model.envelope[i + 1];
      if (next && next.x0 === s.x0 && next.x1 === s.x1) return "";
      return `M${x(s.x0)},${y(s.z1)} H${x(s.x1)}`;
    })
    .join(" ");

  const select = (levels: number[], e: MouseEvent | KeyboardEvent) =>
    onSelect?.(levels, modifiersOf(e));

  return (
    <figure className={cn("grid gap-2", className)} data-testid="section-preview">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={`Section of ${design.name}: ${design.floors.length} storeys, ${formatLength(design.heightM)} tall`}
      >
        <defs>
          <pattern
            id={hatch}
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="4"
              className="stroke-muted-foreground/50"
              strokeWidth="1"
            />
          </pattern>
        </defs>

        {envelopePath && (
          <g
            aria-hidden
            className="fill-none stroke-envelope/60"
            strokeDasharray="3 3"
            strokeWidth={1}
          >
            <path d={envelopePath} />
            <path d={envelopeTops} />
          </g>
        )}

        {showThreshold && (
          <g aria-hidden>
            <line
              x1={leftEdge}
              x2={buildingRight + 4}
              y1={y(threshold)}
              y2={y(threshold)}
              className="stroke-muted-foreground/40"
              strokeDasharray="1 3"
            />
            <text
              x={leftEdge - 4}
              y={y(threshold) + 3}
              textAnchor="end"
              className="fill-muted-foreground font-mono text-[9px]"
            >
              {threshold} m
            </text>
          </g>
        )}

        <g>
          {model.bands.map((band) => {
            const isSelected = chosen.has(band.level);
            const isBreach = breached.has(band.level) || band.empty;
            const bandHeight = Math.max(0.5, (band.z1 - band.z0) * scale - 0.6);
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut; the labels are the keyboard path
              <rect
                key={band.level}
                data-level={band.level}
                data-use={band.use}
                x={x(band.x0)}
                y={y(band.z1) + 0.3}
                width={Math.max(1, (band.x1 - band.x0) * scale)}
                height={bandHeight}
                fill={band.empty ? "transparent" : floorUseColor(band.use)}
                className={cn(
                  onSelect && "cursor-pointer",
                  isBreach && "stroke-fail",
                  isSelected && !isBreach && "stroke-primary",
                )}
                strokeWidth={isSelected ? 1.6 : isBreach ? 1.2 : 0}
                strokeDasharray={band.empty ? "2 2" : undefined}
                opacity={chosen.size > 0 && !isSelected ? 0.55 : 1}
                onClick={(e) => select([band.level], e)}
              >
                <title>{`Floor ${band.level + 1} · ${USE_LABEL[band.use]} · ${formatArea(band.areaM2)}`}</title>
              </rect>
            );
          })}
        </g>

        {top && (
          <rect
            aria-hidden
            x={x(top.x0 + (top.x1 - top.x0) * 0.32)}
            y={y(top.z1 + PLANT_M)}
            width={Math.max(2, (top.x1 - top.x0) * 0.36 * scale)}
            height={PLANT_M * scale}
            fill={`url(#${hatch})`}
            className="stroke-muted-foreground/60"
            strokeWidth={0.6}
          >
            <title>Roof plant (indicative, not counted in floor area)</title>
          </rect>
        )}

        {top && (
          <g aria-hidden>
            <line
              x1={PADDING}
              x2={x(top.x0) - 3}
              y1={y(model.heightM)}
              y2={y(model.heightM)}
              className="stroke-foreground/50"
              strokeWidth={0.8}
            />
            <text
              x={PADDING}
              y={y(model.heightM) - 4}
              className="fill-foreground font-medium font-mono text-[10.5px]"
              data-testid="section-height"
            >
              {formatLength(design.heightM)}
            </text>
          </g>
        )}

        <g aria-hidden>
          <line
            x1={PADDING / 2}
            x2={WIDTH - LABEL_WIDTH}
            y1={groundY}
            y2={groundY}
            className="stroke-foreground"
            strokeWidth={1.2}
          />
          <line
            x1={x(model.ground.x0)}
            x2={x(model.ground.x1)}
            y1={groundY + 3}
            y2={groundY + 3}
            className="stroke-muted-foreground"
            strokeWidth={2}
          />
        </g>

        <g>
          {layout.labels.map(({ group, y: ly, anchorY }) => {
            const levels = Array.from({ length: group.count }, (_, i) => group.start + i);
            const isSelected = levels.every((l) => chosen.has(l));
            const bandRight = Math.max(
              ...model.bands
                .filter((b) => b.level >= group.start && b.level <= group.end)
                .map((b) => x(b.x1)),
            );
            const name = `${group.count === 1 ? `Floor ${group.start + 1}` : `Floors ${group.start + 1}–${group.end + 1}`}: ${USE_LABEL[group.use]}, ${formatArea(group.areaM2)}`;
            return (
              // biome-ignore lint/a11y/useSemanticElements: an SVG label cannot be a <button>
              <g
                key={group.start}
                role="button"
                tabIndex={onSelect ? 0 : -1}
                aria-label={`Select ${name}`}
                aria-pressed={isSelected}
                data-testid="section-group"
                className={cn(
                  "outline-none",
                  onSelect && "cursor-pointer [&:focus-visible>rect]:stroke-ring",
                )}
                onClick={(e) => select(levels, e)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select(levels, e);
                  }
                }}
              >
                <line
                  x1={bandRight + 2}
                  x2={layout.labelX - 4}
                  y1={anchorY}
                  y2={ly}
                  className="stroke-muted-foreground/50"
                  strokeWidth={0.6}
                />
                <rect
                  x={layout.labelX - 3}
                  y={ly - 9}
                  width={LABEL_WIDTH - 6}
                  height={14}
                  rx={3}
                  className={cn(
                    isSelected ? "fill-accent" : "fill-transparent",
                    "stroke-transparent",
                  )}
                  strokeWidth={1.5}
                />
                <circle cx={layout.labelX + 2} cy={ly - 2} r={3} fill={floorUseColor(group.use)} />
                <text x={layout.labelX + 9} y={ly + 1.5} className="fill-foreground text-[10.5px]">
                  <tspan className="font-medium">{groupLabel(group)}</tspan>
                  <tspan className="fill-muted-foreground font-mono">
                    {" "}
                    · {formatArea(group.areaM2)}
                  </tspan>
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-0 w-4 border-envelope/70 border-t border-dashed" />
          Allowed envelope
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-1 w-4 rounded-sm bg-muted-foreground" />
          Plot, {formatLength(model.ground.x1 - model.ground.x0)} along the road
        </span>
        <span>To scale, seen from the road</span>
      </figcaption>
    </figure>
  );
}
