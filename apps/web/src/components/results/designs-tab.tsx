"use client";

import { type Design, farLimit } from "@envelope/engine";
import { cn } from "@envelope/ui/lib/utils";
import { formatArea, formatFar, formatInt, formatLength } from "@/lib/results/format";
import type { Scene } from "@/lib/results/scene";
import { useResultsView } from "@/lib/results/view";
import { SectionTitle } from "./bits";
import { DesignCard } from "./design-card";

export type DesignContext = { farMax: (design: Design) => number; keyLabel: string | null };

export function designContext(scene: Scene): DesignContext {
  const { input } = scene;
  return {
    farMax: (design) => farLimit(input.zone, input.farBonusPct, design.envelope === "highRise"),
    keyLabel:
      input.buildingType === "condo" ? "Units" : input.buildingType === "hotel" ? "Rooms" : null,
  };
}

export function DesignsTab({ scene }: { scene: Scene }) {
  const { designs } = scene.result;
  const selected = useResultsView((s) => s.selectedDesign);
  const context = designContext(scene);

  if (designs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
        No concept design fits inside the allowed space on this plot. Enlarge the plot, or check the
        road width and the rule switches in the Rules tab.
      </p>
    );
  }

  return (
    <div className="grid gap-6" data-testid="designs">
      <section aria-label="Compare designs" className="grid gap-2">
        <SectionTitle>Compare</SectionTitle>
        <Comparison designs={designs} selected={selected} context={context} />
        <p className="text-muted-foreground text-xs">
          Select a design to see it on the map inside the allowed space.
        </p>
      </section>
      <ul className="grid gap-4">
        {designs.map((design) => (
          <li key={design.id}>
            <DesignCard design={design} selected={design.id === selected} context={context} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Comparison({
  designs,
  selected,
  context,
}: {
  designs: readonly Design[];
  selected: string | null;
  context: DesignContext;
}) {
  const rows: { label: string; value: (d: Design) => string }[] = [
    { label: "Height", value: (d) => formatLength(d.heightM) },
    { label: "Floors", value: (d) => formatInt(d.floors.length) },
    { label: "Floor area", value: (d) => formatArea(d.gfaM2) },
    { label: "FAR", value: (d) => `${formatFar(d.farUsed)} / ${formatFar(context.farMax(d))}` },
    ...(context.keyLabel
      ? [{ label: context.keyLabel, value: (d: Design) => formatInt(d.keyCount ?? 0) }]
      : []),
    {
      label: "Parking",
      value: (d) =>
        `${formatInt(d.parking.providedSpaces)} / ${formatInt(d.parking.requiredSpaces)}`,
    },
  ];
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-xs sm:text-sm" data-testid="design-comparison">
        <thead>
          <tr className="border-b">
            <th scope="col" className="w-0 px-3 py-2 text-left font-normal text-muted-foreground">
              <span className="sr-only">Figure</span>
            </th>
            {designs.map((d) => (
              <th
                key={d.id}
                scope="col"
                className={cn(
                  "px-3 py-2 text-right align-bottom",
                  d.id === selected && "bg-accent",
                )}
              >
                <button
                  type="button"
                  className="font-semibold hover:underline"
                  onClick={() => useResultsView.getState().selectDesign(d.id, d.envelope)}
                >
                  {d.name.split(" · ")[0]}
                </button>
                <span
                  className={cn(
                    "block font-medium text-[11px] uppercase tracking-wide",
                    d.passes ? "text-pass" : "text-fail",
                  )}
                >
                  {d.passes ? "Passes" : "Fails"}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b last:border-b-0">
              <th
                scope="row"
                className="whitespace-nowrap px-3 py-1.5 text-left font-normal text-muted-foreground"
              >
                {row.label}
              </th>
              {designs.map((d) => (
                <td
                  key={d.id}
                  className={cn(
                    "whitespace-nowrap px-3 py-1.5 text-right font-mono tabular",
                    d.id === selected && "bg-accent",
                  )}
                >
                  {row.value(d)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
