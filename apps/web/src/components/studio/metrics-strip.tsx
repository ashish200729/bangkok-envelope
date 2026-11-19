"use client";

import type { EngineInput } from "@envelope/engine";
import { cn } from "@envelope/ui/lib/utils";
import { ListChecks } from "lucide-react";
import { formatArea, formatFar, formatInt, formatLength, formatNumber } from "@/lib/results/format";
import { type AnyDesign, useResultsView } from "@/lib/results/view";
import type { CheckTarget } from "@/lib/studio/checks";
import { type DesignMetrics, designMetrics, keyLabel } from "@/lib/studio/metrics";

type Tile = {
  label: string;
  value: string;
  delta: number | null;
  /** How to print the delta, without its sign. */
  formatDelta: (n: number) => string;
  target?: CheckTarget;
  testId: string;
};

function deltaText(delta: number, format: (n: number) => string): string | null {
  const shown = format(Math.abs(delta));
  if (Number(shown.replace(/[^\d.]/g, "")) === 0) return null;
  return `${delta > 0 ? "+" : "−"}${shown}`;
}

const diff = (now: number | null, then: number | null | undefined) =>
  now === null || then === null || then === undefined ? null : now - then;

function tiles(m: DesignMetrics, base: DesignMetrics | null, input: EngineInput): Tile[] {
  const keys = keyLabel(input.buildingType);
  return [
    {
      label: "Floor area",
      value: formatArea(m.gfaM2),
      delta: diff(m.gfaM2, base?.gfaM2),
      formatDelta: (n) => formatInt(n),
      target: "gfa",
      testId: "metric-gfa",
    },
    {
      label: "FAR used / max",
      value: `${formatNumber(m.far, 2)} / ${formatFar(m.farMax)}`,
      delta: diff(m.far, base?.far),
      formatDelta: (n) => formatNumber(n, 2),
      target: "gfa",
      testId: "metric-far",
    },
    {
      label: "Height",
      value: `${formatLength(m.heightM)} · ${m.storeys} fl`,
      delta: diff(m.heightM, base?.heightM),
      formatDelta: (n) => `${formatNumber(n, 1)} m`,
      testId: "metric-height",
    },
    keys
      ? {
          label: keys,
          value: formatInt(m.keys ?? 0),
          delta: diff(m.keys, base?.keys),
          formatDelta: (n) => formatInt(n),
          target: "units" as const,
          testId: "metric-keys",
        }
      : {
          label: "Office area",
          value: formatArea(m.useAreaM2),
          delta: diff(m.useAreaM2, base?.useAreaM2),
          formatDelta: (n) => formatInt(n),
          testId: "metric-use",
        },
    {
      label: "Parking",
      value: `${formatInt(m.parkingProvided)} / ${formatInt(m.parkingRequired)}`,
      delta: diff(m.parkingProvided, base?.parkingProvided),
      formatDelta: (n) => formatInt(n),
      target: "parking",
      testId: "metric-parking",
    },
    {
      label: "Open ground",
      value: formatArea(m.openGroundM2),
      delta: diff(m.openGroundM2, base?.openGroundM2),
      formatDelta: (n) => formatInt(n),
      target: "open",
      testId: "metric-open",
    },
    m.saleableM2 !== null
      ? {
          label: "Saleable ≈",
          value: formatArea(m.saleableM2),
          delta: diff(m.saleableM2, base?.saleableM2),
          formatDelta: (n) => formatInt(n),
          testId: "metric-saleable",
        }
      : {
          label: "Main-use area",
          value: formatArea(m.useAreaM2),
          delta: diff(m.useAreaM2, base?.useAreaM2),
          formatDelta: (n) => formatInt(n),
          testId: "metric-use-area",
        },
  ];
}

/**
 * The variant's key figures, kept at the top of the editor, with the change from the option it
 * came from and the checklist count (which opens the Rules tab).
 */
export function MetricsStrip({
  design,
  baseline,
  input,
  failing,
  updating,
}: {
  design: AnyDesign;
  baseline: AnyDesign | null;
  input: EngineInput;
  failing: ReadonlySet<CheckTarget>;
  updating: boolean;
}) {
  const m = designMetrics(design, input);
  const base = baseline ? designMetrics(baseline, input) : null;
  return (
    <div
      className="sticky top-0 z-20 -mx-4 border-b bg-background/95 px-4 py-2.5 backdrop-blur"
      data-testid="metrics-strip"
      data-updating={updating || undefined}
    >
      <dl
        className={cn(
          "grid grid-cols-3 gap-x-3 gap-y-2 transition-opacity",
          updating && "opacity-70",
        )}
      >
        {tiles(m, base, input).map((tile) => {
          const bad = tile.target !== undefined && failing.has(tile.target);
          const delta = tile.delta === null ? null : deltaText(tile.delta, tile.formatDelta);
          return (
            <div key={tile.label} className="grid min-w-0 content-start" data-testid={tile.testId}>
              <dt
                className={cn("truncate text-[11px]", bad ? "text-fail" : "text-muted-foreground")}
              >
                {tile.label}
              </dt>
              <dd
                className={cn(
                  "truncate font-medium font-mono text-[13px] tabular",
                  bad && "text-fail",
                )}
                data-testid={`${tile.testId}-value`}
              >
                {tile.value}
              </dd>
              <dd className="h-3.5 truncate font-mono text-[10.5px] text-muted-foreground tabular">
                {delta ?? ""}
              </dd>
            </div>
          );
        })}
        <div className="grid content-start">
          <dt className="text-[11px] text-muted-foreground">Checks</dt>
          <dd>
            <button
              type="button"
              data-testid="checklist-chip"
              onClick={() => useResultsView.getState().setEditing(false)}
              className={cn(
                "mt-px inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md px-1.5 font-medium text-[11px] tabular-nums focus-visible:outline-2 focus-visible:outline-ring",
                m.failCount > 0 ? "bg-fail/12 text-fail" : "bg-pass/12 text-pass",
              )}
            >
              <ListChecks className="size-3.5" aria-hidden />
              {m.passCount} pass · {m.failCount} fail
            </button>
          </dd>
        </div>
      </dl>
      {base && (
        <p className="mt-1 text-[10.5px] text-muted-foreground">
          Changes are against {baseline?.name}.
        </p>
      )}
    </div>
  );
}
