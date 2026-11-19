"use client";

import { type EngineInput, formatTHB } from "@envelope/engine";
import { Button } from "@envelope/ui/components/button";
import { cn } from "@envelope/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { formatArea, formatFar, formatInt, formatLength } from "@/lib/results/format";
import { type AnyDesign, useResultsView } from "@/lib/results/view";
import { feasibilityOf, useFeasibility } from "@/lib/studio/feasibility";
import { designMetrics, keyLabel, MAIN_USE_LABEL } from "@/lib/studio/metrics";
import { entryName, type OptionEntry } from "@/lib/studio/options";
import { useOptions } from "@/lib/studio/use-options";
import { OptionBadge } from "./option-card";

type Column = {
  id: string;
  label: string;
  note?: string;
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
    { id: "storeys", label: "Storeys", value: (d) => formatInt(d.floors.length) },
    { id: "use", label: MAIN_USE_LABEL[input.buildingType], value: (d) => formatArea(d.useAreaM2) },
    {
      id: "shops",
      label: "Shops",
      value: (d) => {
        const m2 = designMetrics(d, input).retailM2;
        return m2 > 0 ? formatArea(m2) : "–";
      },
    },
    {
      id: "parking",
      label: "Parking",
      note: "have / need",
      value: (d) =>
        `${formatInt(d.parking.providedSpaces)} / ${formatInt(d.parking.requiredSpaces)}`,
      tone: (d) => (d.parking.providedSpaces < d.parking.requiredSpaces ? "fail" : undefined),
    },
    ...(keys
      ? [{ id: "keys", label: keys, value: (d: AnyDesign) => formatInt(d.keyCount ?? 0) }]
      : []),
    { id: "cost", label: "Rough cost", value: (d) => formatTHB(money(d).costs.totalTHB) },
    {
      id: "income",
      label: "Income a year",
      value: (d) => {
        const income = money(d).value.incomePerYearTHB;
        return income === null ? "–" : formatTHB(income);
      },
    },
    {
      id: "land",
      label: "Left for land",
      value: (d) => formatTHB(money(d).leftForLandTHB),
      tone: (d) => (money(d).landVerdict === "covers land" ? "pass" : "fail"),
    },
  ];
}

const select = (entry: OptionEntry) =>
  useResultsView.getState().selectDesign(entry.id, entry.design?.envelope);

/** Every option side by side under the map. Selecting a row selects the option. */
export function ComparisonStrip({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { scene, entries } = useOptions();
  const values = useFeasibility((s) => s.values);
  const selected = useResultsView((s) => s.selectedDesign);
  if (!scene || entries.length === 0) return null;
  const cols = columns(scene.input, values);
  const rows = entries.filter((e) => e.design);

  return (
    <section
      aria-label="Compare options"
      className="border-t bg-background"
      data-testid="comparison-strip"
    >
      <div className="flex h-10 items-center gap-3 px-4">
        <h2 className="font-medium text-sm">Compare options</h2>
        <span className="text-muted-foreground text-xs">
          Land at market price{" "}
          {formatTHB(
            rows[0]?.design ? feasibilityOf(rows[0].design, scene.input, values).landCostTHB : 0,
          )}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-expanded={open}
          aria-controls="comparison-table"
          onClick={() => onOpenChange(!open)}
        >
          {open ? "Hide" : "Show"}
          <ChevronDown className={cn("transition-transform", !open && "rotate-180")} />
        </Button>
      </div>
      {open && (
        <div id="comparison-table" className="max-h-64 overflow-y-auto overflow-x-auto border-t">
          <table className="w-full text-xs" data-testid="design-comparison">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="py-1.5 pr-2 pl-4 text-left font-normal">
                  Option
                </th>
                {cols.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    className="px-2 py-1.5 text-right font-normal whitespace-nowrap"
                  >
                    {c.label}
                    {c.note && <span className="block text-[10px] leading-tight">{c.note}</span>}
                  </th>
                ))}
                <th scope="col" className="py-1.5 pr-4 pl-2 text-right font-normal">
                  Passes
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
                    onClick={() => select(entry)}
                    className={cn(
                      "cursor-pointer border-b last:border-b-0 hover:bg-muted/60",
                      isSelected && "bg-accent hover:bg-accent",
                    )}
                  >
                    <th scope="row" className="py-1.5 pr-2 pl-4 text-left font-normal">
                      <button
                        type="button"
                        className="flex max-w-56 items-center gap-2 rounded text-left focus-visible:outline-2 focus-visible:outline-ring"
                        aria-pressed={isSelected}
                        onClick={(e) => {
                          e.stopPropagation();
                          select(entry);
                        }}
                      >
                        <OptionBadge
                          badge={entry.badge}
                          custom={entry.kind === "variant"}
                          className="h-5 min-w-5 text-[10px]"
                        />
                        <span className="truncate font-medium">{entryName(entry)}</span>
                      </button>
                    </th>
                    {cols.map((c) => {
                      const tone = c.tone?.(d);
                      return (
                        <td
                          key={c.id}
                          className={cn(
                            "whitespace-nowrap px-2 py-1.5 text-right font-mono tabular",
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
                        "py-1.5 pr-4 pl-2 text-right font-medium",
                        d.passes ? "text-pass" : "text-fail",
                      )}
                    >
                      {d.passes ? "Yes" : "No"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** The comparison on phones: one compact card per option. */
export function ComparisonCards() {
  const { scene, entries } = useOptions();
  const values = useFeasibility((s) => s.values);
  const selected = useResultsView((s) => s.selectedDesign);
  if (!scene) return null;
  const cols = columns(scene.input, values);
  const rows = entries.filter((e) => e.design);
  if (rows.length < 2) return null;
  return (
    <details className="group rounded-xl border bg-card" data-testid="comparison-cards">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 font-medium text-sm [&::-webkit-details-marker]:hidden">
        Compare all options
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="grid gap-2 border-t p-2.5">
        {rows.map((entry) => {
          const d = entry.design as AnyDesign;
          return (
            <li key={entry.id}>
              <button
                type="button"
                aria-pressed={entry.id === selected}
                onClick={() => select(entry)}
                className={cn(
                  "grid w-full gap-2 rounded-lg border p-2.5 text-left",
                  entry.id === selected && "border-primary",
                )}
              >
                <span className="flex items-center gap-2 text-sm">
                  <OptionBadge
                    badge={entry.badge}
                    custom={entry.kind === "variant"}
                    className="h-5 min-w-5 text-[10px]"
                  />
                  <span className="truncate font-medium">{entryName(entry)}</span>
                  <span className={cn("ml-auto text-xs", d.passes ? "text-pass" : "text-fail")}>
                    {d.passes ? "Passes" : "Fails"}
                  </span>
                </span>
                <dl className="grid grid-cols-3 gap-x-2 gap-y-1.5">
                  {cols.map((c) => (
                    <div key={c.id} className="min-w-0">
                      <dt className="truncate text-[10.5px] text-muted-foreground">{c.label}</dt>
                      <dd
                        className={cn(
                          "truncate font-mono text-xs tabular",
                          c.tone?.(d) === "fail" && "text-fail",
                        )}
                      >
                        {c.value(d)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
