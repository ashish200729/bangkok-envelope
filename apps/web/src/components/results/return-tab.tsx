"use client";

import { type EngineInput, formatTHB, formatTHBPerSqWah, USE_LABEL } from "@envelope/engine";
import { cn } from "@envelope/ui/lib/utils";
import { CircleAlert, CircleCheck } from "lucide-react";
import { formatInt } from "@/lib/results/format";
import type { AnyDesign } from "@/lib/results/view";
import { feasibilityOf, useFeasibility, verdictText } from "@/lib/studio/feasibility";
import { AssumptionsEditor } from "../studio/assumptions-editor";
import { SectionTitle } from "./bits";
import { ArithmeticLines, RoughNote } from "./cost-tab";

const BASIS_LABEL = {
  sale: "Sold",
  investment: "Held for income",
  none: "No direct value",
} as const;

export function ReturnTab({ design, input }: { design: AnyDesign; input: EngineInput }) {
  const values = useFeasibility((s) => s.values);
  const f = feasibilityOf(design, input, values);
  const covers = f.landVerdict === "covers land";
  const Icon = covers ? CircleCheck : CircleAlert;
  const landShare = f.landCostTHB > 0 ? Math.min(1, f.leftForLandTHB / f.landCostTHB) : 1;

  return (
    <div className="grid gap-4" data-testid="return-tab">
      <section
        aria-label="Land verdict"
        className={cn(
          "grid gap-3 rounded-xl border p-4",
          covers ? "border-pass/40 bg-pass/6" : "border-fail/40 bg-fail/6",
        )}
      >
        <p
          className={cn(
            "flex items-center gap-2 font-semibold",
            covers ? "text-pass" : "text-fail",
          )}
          data-testid="land-verdict"
        >
          <Icon className="size-4" aria-hidden />
          {verdictText(f, formatTHB)}
        </p>
        <dl className="grid grid-cols-2 gap-3">
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">Left for land</dt>
            <dd className="font-mono font-semibold text-xl tabular" data-testid="left-for-land">
              {formatTHB(f.leftForLandTHB)}
            </dd>
            <dd className="text-muted-foreground text-xs">
              {formatTHBPerSqWah(f.perM2.leftForLandPerSqWah)}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">Land at market price</dt>
            <dd className="font-mono font-semibold text-xl tabular">{formatTHB(f.landCostTHB)}</dd>
            <dd className="text-muted-foreground text-xs">
              {formatInt(f.plotAreaSqWah)} sq wah × {formatTHBPerSqWah(f.perM2.landPricePerSqWah)}
            </dd>
          </div>
        </dl>
        <div aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", covers ? "bg-pass" : "bg-fail")}
            style={{ width: `${Math.max(0, landShare) * 100}%` }}
          />
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          At the Treasury appraisal (a lower, tax-only reference) the land would be{" "}
          <span className="font-mono text-foreground tabular">
            {formatTHB(f.landTreasuryCostTHB)}
          </span>
          . Left for land is what a developer could pay after building costs and a{" "}
          {formatInt(values.developerMargin * 100)}% profit on all costs.
        </p>
      </section>

      <dl className="grid grid-cols-3 gap-3 rounded-xl border bg-card p-4">
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground text-xs">Value when built</dt>
          <dd className="font-mono font-semibold tabular" data-testid="gdv">
            {formatTHB(f.value.grossDevelopmentValueTHB)}
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground text-xs">Income a year</dt>
          <dd className="font-mono font-semibold tabular">
            {f.value.incomePerYearTHB === null ? "None held" : formatTHB(f.value.incomePerYearTHB)}
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground text-xs">Developer profit</dt>
          <dd className="font-mono font-semibold tabular">{formatTHB(f.marginTHB)}</dd>
        </div>
      </dl>

      <section aria-label="Value by use" className="grid gap-2">
        <SectionTitle>Value by use</SectionTitle>
        <ul className="grid divide-y rounded-lg border bg-card text-sm">
          {f.value.byUse
            .filter((row) => row.areaM2 > 0)
            .map((row) => (
              <li key={row.use} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                <span>
                  {USE_LABEL[row.use]}{" "}
                  <span className="text-muted-foreground text-xs">· {BASIS_LABEL[row.basis]}</span>
                </span>
                <span className="font-mono tabular">{formatTHB(row.valueTHB)}</span>
              </li>
            ))}
        </ul>
      </section>

      <ArithmeticLines feasibility={f} />
      <AssumptionsEditor />
      <RoughNote />
    </div>
  );
}
