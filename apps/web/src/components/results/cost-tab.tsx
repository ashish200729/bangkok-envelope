"use client";

import { type EngineInput, type Feasibility, formatTHB, USE_LABEL } from "@envelope/engine";
import { floorUseColor } from "@/lib/results/designs";
import { formatArea } from "@/lib/results/format";
import type { AnyDesign } from "@/lib/results/view";
import { feasibilityOf, useFeasibility } from "@/lib/studio/feasibility";
import { SectionTitle } from "./bits";

const COST_KEYS = /^(cost|softCostShare|contingencyShare)/;

export function ArithmeticLines({
  feasibility,
  only,
}: {
  feasibility: Feasibility;
  only?: (keys: readonly string[]) => boolean;
}) {
  const lines = feasibility.lines.filter((line) => !only || only(line.keys));
  if (lines.length === 0) return null;
  return (
    <details className="group rounded-lg border bg-card">
      <summary className="cursor-pointer list-none px-3 py-2 font-medium text-sm [&::-webkit-details-marker]:hidden">
        How this is worked out
      </summary>
      <ul className="grid gap-1.5 border-t px-3 py-2.5 text-muted-foreground text-xs leading-relaxed">
        {lines.map((line) => (
          <li key={line.text}>{line.text}</li>
        ))}
      </ul>
    </details>
  );
}

export function RoughNote() {
  return (
    <p className="text-muted-foreground text-xs leading-relaxed">
      Rough concept-stage figures from published averages. Financing, selling costs and the time to
      sell are not modelled. Change any assumption in the Return tab.
    </p>
  );
}

export function CostTab({ design, input }: { design: AnyDesign; input: EngineInput }) {
  const values = useFeasibility((s) => s.values);
  const f = feasibilityOf(design, input, values);
  const { construction } = f.costs;
  const rows = construction.byUse.filter((row) => row.areaM2 > 0);

  return (
    <div className="grid gap-4" data-testid="cost-tab">
      <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4">
        <div className="grid gap-0.5">
          <p className="text-muted-foreground text-xs">Rough cost to build</p>
          <p className="font-mono font-semibold text-2xl tabular" data-testid="cost-total">
            {formatTHB(f.costs.totalTHB)}
          </p>
          <p className="text-muted-foreground text-xs">Land not included</p>
        </div>
        <div className="grid gap-0.5">
          <p className="text-muted-foreground text-xs">Per m² of floor area</p>
          <p className="font-mono font-semibold text-2xl tabular">
            {formatTHB(f.perM2.costPerM2Gfa)}
          </p>
          <p className="text-muted-foreground text-xs">over {formatArea(design.gfaM2)}</p>
        </div>
      </div>

      <section className="grid gap-2" aria-label="Cost by use">
        <SectionTitle>Construction by use</SectionTitle>
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs">
              <tr className="border-b">
                <th scope="col" className="px-3 py-1.5 text-left font-normal">
                  Use
                </th>
                <th scope="col" className="px-3 py-1.5 text-right font-normal">
                  Area
                </th>
                <th scope="col" className="px-3 py-1.5 text-right font-normal">
                  Rate
                </th>
                <th scope="col" className="px-3 py-1.5 text-right font-normal">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody className="font-mono tabular">
              {rows.map((row) => (
                <tr key={row.use} className="border-b">
                  <td className="px-3 py-1.5 font-sans">
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="size-2 rounded-sm"
                        style={{ background: floorUseColor(row.use) }}
                      />
                      {USE_LABEL[row.use]}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right">{formatArea(row.areaM2)}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {formatTHB(row.ratePerM2)}
                  </td>
                  <td className="px-3 py-1.5 text-right">{formatTHB(row.costTHB)}</td>
                </tr>
              ))}
              <tr className="border-b">
                <td colSpan={3} className="px-3 py-1.5 font-sans">
                  Construction
                </td>
                <td className="px-3 py-1.5 text-right">{formatTHB(construction.totalTHB)}</td>
              </tr>
              <tr className="border-b">
                <td colSpan={3} className="px-3 py-1.5 font-sans">
                  Soft costs (fees, studies, permits)
                </td>
                <td className="px-3 py-1.5 text-right">{formatTHB(f.costs.softCostsTHB)}</td>
              </tr>
              <tr className="border-b">
                <td colSpan={3} className="px-3 py-1.5 font-sans">
                  Contingency
                </td>
                <td className="px-3 py-1.5 text-right">{formatTHB(f.costs.contingencyTHB)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={3} className="px-3 py-2">
                  Total, before land
                </td>
                <td className="px-3 py-2 text-right font-mono tabular">
                  {formatTHB(f.costs.totalTHB)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-muted-foreground text-xs">Rates are per m² of floor area.</p>
      </section>

      <ArithmeticLines feasibility={f} only={(keys) => keys.some((k) => COST_KEYS.test(k))} />
      <RoughNote />
    </div>
  );
}
