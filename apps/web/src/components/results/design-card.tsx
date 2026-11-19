"use client";

import type { Design } from "@envelope/engine";
import { cn } from "@envelope/ui/lib/utils";
import { ChevronRight, Eye } from "lucide-react";
import { floorUseColor, floorUses, scheduleAreasM2, sumFloorAreas } from "@/lib/results/designs";
import {
  FLOOR_USE_LABEL,
  floorNumber,
  formatArea,
  formatCheckFigures,
  formatFar,
  formatInt,
  formatLength,
  formatPercent,
} from "@/lib/results/format";
import { useResultsView } from "@/lib/results/view";
import { CitationLink, Figure, StatusPill } from "./bits";
import type { DesignContext } from "./designs-tab";

export function DesignCard({
  design,
  selected,
  context,
}: {
  design: Design;
  selected: boolean;
  context: DesignContext;
}) {
  const farMax = context.farMax;
  const fails = design.checks.filter((c) => c.status === "fail").length;

  return (
    <article
      aria-label={design.name}
      data-testid={`design-${design.id}`}
      data-selected={selected}
      className={cn(
        "grid gap-4 rounded-lg border bg-card p-4 transition-shadow",
        selected && "border-primary ring-2 ring-primary/30",
      )}
    >
      <header className="grid gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-base">{design.name}</h3>
          <StatusPill status={design.passes ? "pass" : "fail"} />
        </div>
        <p className="text-muted-foreground text-sm leading-snug">{design.summary}</p>
        <button
          type="button"
          aria-pressed={selected}
          onClick={() =>
            useResultsView.getState().selectDesign(selected ? null : design.id, design.envelope)
          }
          className={cn(
            "mt-1 inline-flex h-8 w-fit items-center gap-1.5 rounded-md border px-3 font-medium text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <Eye className="size-4" />
          {selected ? "Shown on the map" : "Show on the map"}
        </button>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Figure label="Height" value={formatLength(design.heightM)} />
        <Figure label="Floors" value={formatInt(design.floors.length)} />
        <Figure label="Floor area" value={formatArea(design.gfaM2)} />
        {context.keyLabel && (
          <Figure label={context.keyLabel} value={formatInt(design.keyCount ?? 0)} />
        )}
        <Figure
          label="Parking"
          value={`${formatInt(design.parking.providedSpaces)} / ${formatInt(design.parking.requiredSpaces)}`}
          detail="provided / required"
        />
        <Figure
          label="Open ground"
          value={formatArea(design.openSpaceM2)}
          detail={`OSR ${formatPercent(design.osrUsed)}`}
        />
      </dl>

      <FarBar used={design.farUsed} max={farMax} />

      <UseLegend design={design} />

      <section aria-label="Checklist" className="grid gap-2">
        <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          Checklist{" "}
          <span className={cn("normal-case tracking-normal", fails ? "text-fail" : "text-pass")}>
            · {fails ? `${fails} failing` : "all pass"}
          </span>
        </h4>
        <ul className="grid gap-2">
          {design.checks.map((check) => {
            const figures = formatCheckFigures(check);
            return (
              <li
                key={`${check.ruleId}-${check.message}`}
                className="flex items-start gap-2.5 text-sm"
              >
                <StatusPill status={check.status} className="mt-0.5" />
                <div className="grid min-w-0 gap-0.5">
                  <p className="leading-snug">{check.message}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
                    <span>{check.label}</span>
                    {figures && <span className="font-mono tabular">{figures}</span>}
                    <CitationLink source={check.source} />
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <FloorSchedule design={design} />
    </article>
  );
}

function FarBar({ used, max }: { used: number; max: number }) {
  const share = max > 0 ? Math.min(1, used / max) : 0;
  const over = used > max + 1e-9;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">Floor area ratio used</span>
        <span className="font-mono tabular">
          <span className={cn("font-semibold", over && "text-fail")}>{formatFar(used)}</span> of{" "}
          {formatFar(max)}
        </span>
      </div>
      <div aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", over ? "bg-fail" : "bg-primary")}
          style={{ width: `${share * 100}%` }}
        />
      </div>
    </div>
  );
}

function UseLegend({ design }: { design: Design }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
      {floorUses(design).map((use) => (
        <li key={use} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-sm"
            style={{ background: floorUseColor(use) }}
          />
          {FLOOR_USE_LABEL[use]}
        </li>
      ))}
    </ul>
  );
}

function FloorSchedule({ design }: { design: Design }) {
  const total = sumFloorAreas(design);
  const areas = scheduleAreasM2(design);
  const topDown = design.floors.map((floor, i) => ({ floor, areaM2: areas[i] ?? 0 })).reverse();
  return (
    <details className="group rounded-md border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-medium text-sm [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
        Floor schedule
        <span className="ml-auto font-normal text-muted-foreground text-xs">
          {design.floors.length} floors
        </span>
      </summary>
      <div className="max-h-80 overflow-y-auto border-t">
        <table className="w-full text-sm" data-testid={`schedule-${design.id}`}>
          <thead className="sticky top-0 bg-card text-muted-foreground text-xs">
            <tr className="border-b">
              <th scope="col" className="px-3 py-1.5 text-left font-normal">
                Floor
              </th>
              <th scope="col" className="px-3 py-1.5 text-left font-normal">
                Use
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-normal">
                Height
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-normal">
                Area
              </th>
            </tr>
          </thead>
          <tbody className="font-mono tabular">
            {topDown.map(({ floor, areaM2 }) => (
              <tr key={floor.level} className="border-b last:border-b-0">
                <td className="px-3 py-1">{floorNumber(floor.level)}</td>
                <td className="px-3 py-1 font-sans">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-2 rounded-sm"
                      style={{ background: floorUseColor(floor.use) }}
                    />
                    {FLOOR_USE_LABEL[floor.use]}
                  </span>
                </td>
                <td className="px-3 py-1 text-right">{formatLength(floor.heightM)}</td>
                <td className="px-3 py-1 text-right">{formatArea(areaM2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-card">
            <tr className="border-t font-semibold">
              <td colSpan={3} className="px-3 py-1.5">
                Total floor area
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular" data-testid="schedule-total">
                {formatArea(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </details>
  );
}
