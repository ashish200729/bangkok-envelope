"use client";

import { type EngineInput, formatTHB } from "@envelope/engine";
import { Button } from "@envelope/ui/components/button";
import { cn } from "@envelope/ui/lib/utils";
import { X } from "lucide-react";
import { useEffect } from "react";
import { formatArea, formatFar, formatInt, formatLength } from "@/lib/results/format";
import { type AnyDesign, useResultsView } from "@/lib/results/view";
import { feasibilityOf, useFeasibility } from "@/lib/studio/feasibility";
import { keyLabel } from "@/lib/studio/metrics";
import { entryName, type OptionEntry } from "@/lib/studio/options";
import { useOptions } from "@/lib/studio/use-options";
import { SchemeBadge } from "./bits";

type Column = {
  id: string;
  label: string;
  value: (d: AnyDesign) => string;
  tone?: (d: AnyDesign) => "pass" | "fail" | undefined;
};

function columns(
  input: EngineInput,
  values: ReturnType<typeof useFeasibility.getState>["values"],
): Column[] {
  const keys = keyLabel(input.buildingType);
  const money = (d: AnyDesign) => feasibilityOf(d, input, values);
  return [
    { id: "gfa", label: "Floor area", value: (d) => formatArea(d.gfaM2) },
    { id: "far", label: "FAR", value: (d) => formatFar(d.farUsed) },
    { id: "height", label: "Height", value: (d) => formatLength(d.heightM) },
    { id: "storeys", label: "Floors", value: (d) => formatInt(d.floors.length) },
    ...(keys
      ? [{ id: "keys", label: keys, value: (d: AnyDesign) => formatInt(d.keyCount ?? 0) }]
      : []),
    {
      id: "parking",
      label: "Parking",
      value: (d) =>
        `${formatInt(d.parking.providedSpaces)} / ${formatInt(d.parking.requiredSpaces)}`,
      tone: (d) => (d.parking.providedSpaces < d.parking.requiredSpaces ? "fail" : undefined),
    },
    { id: "cost", label: "Build cost", value: (d) => formatTHB(money(d).costs.totalTHB) },
    {
      id: "land",
      label: "Residual land",
      value: (d) => formatTHB(money(d).leftForLandTHB),
      tone: (d) => (money(d).landVerdict === "covers land" ? "pass" : "fail"),
    },
  ];
}

const select = (entry: OptionEntry) =>
  useResultsView.getState().selectDesign(entry.id, entry.design?.envelope);

/** Every scheme side by side, over the lower part of the map. Esc or the cross closes it. */
export function ComparePanel({ onClose }: { onClose: () => void }) {
  const { scene, entries } = useOptions();
  const values = useFeasibility((s) => s.values);
  const selected = useResultsView((s) => s.selectedDesign);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!scene) return null;
  const cols = columns(scene.input, values);
  const rows = entries.filter((e) => e.design);
  if (rows.length === 0) return null;

  return (
    <section
      aria-label="Compare schemes"
      data-testid="compare-panel"
      className="absolute inset-x-3 bottom-3 z-10 overflow-hidden rounded-xl border bg-background/95 shadow-lg backdrop-blur"
    >
      <div className="flex h-10 items-center gap-3 border-b pr-1.5 pl-4">
        <h2 className="font-medium text-sm">Compare schemes</h2>
        <span className="text-muted-foreground text-xs">
          Land at market price{" "}
          {formatTHB(
            rows[0]?.design ? feasibilityOf(rows[0].design, scene.input, values).landCostTHB : 0,
          )}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label="Close the comparison"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <div className="max-h-60 overflow-auto">
        <table className="w-full text-xs" data-testid="design-comparison">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-muted-foreground">
              <th scope="col" className="py-2 pr-2 pl-4 text-left font-normal">
                Scheme
              </th>
              {cols.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className="whitespace-nowrap px-2 py-2 text-right font-normal"
                >
                  {c.label}
                </th>
              ))}
              <th scope="col" className="py-2 pr-4 pl-2 text-right font-normal">
                Checks
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => {
              const d = entry.design as AnyDesign;
              const isSelected = entry.id === selected;
              return (
                <tr
                  key={entry.id}
                  data-selected={isSelected}
                  data-testid={`compare-${entry.id}`}
                  className={cn(
                    "border-b last:border-b-0 hover:bg-muted/50",
                    isSelected && "bg-accent hover:bg-accent",
                  )}
                >
                  <th scope="row" className="py-2 pr-2 pl-4 text-left font-normal">
                    <button
                      type="button"
                      className="flex max-w-56 items-center gap-2 rounded text-left focus-visible:outline-2 focus-visible:outline-ring"
                      aria-pressed={isSelected}
                      onClick={() => select(entry)}
                    >
                      <SchemeBadge badge={entry.badge} custom={entry.kind === "variant"} small />
                      <span className="truncate font-medium">{entryName(entry)}</span>
                    </button>
                  </th>
                  {cols.map((c) => {
                    const tone = c.tone?.(d);
                    return (
                      <td
                        key={c.id}
                        className={cn(
                          "whitespace-nowrap px-2 py-2 text-right font-mono tabular",
                          tone === "fail" && "text-fail",
                          tone === "pass" && "text-pass",
                        )}
                      >
                        {c.value(d)}
                      </td>
                    );
                  })}
                  <td
                    className={cn(
                      "py-2 pr-4 pl-2 text-right font-medium",
                      d.passes ? "text-pass" : "text-fail",
                    )}
                  >
                    {d.passes ? "Pass" : "Fail"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
