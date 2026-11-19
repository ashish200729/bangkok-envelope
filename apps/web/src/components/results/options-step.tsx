"use client";

import { Button } from "@envelope/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@envelope/ui/components/tabs";
import { cn } from "@envelope/ui/lib/utils";
import { Download, Printer, SlidersHorizontal } from "lucide-react";
import { useEffect } from "react";
import { formatArea, formatInt, formatLength } from "@/lib/results/format";
import type { Scene } from "@/lib/results/scene";
import { type AnyDesign, type OptionTab, useResultsView } from "@/lib/results/view";
import { customise } from "@/lib/studio/actions";
import { useStudio } from "@/lib/studio/store";
import { useOptions } from "@/lib/studio/use-options";
import { CustomiseTab } from "../studio/customise-tab";
import { downloadSchedule } from "../studio/variant-header";
import { Checklist, countsText } from "./checklist";
import { ComparisonCards } from "./comparison";
import { CostTab } from "./cost-tab";
import { EngineGuidance } from "./engine-guidance";
import { FloorSchedule } from "./floor-schedule";
import { OptionCard } from "./option-card";
import { ReturnTab } from "./return-tab";
import { SectionPreview } from "./section-preview";

/** Radix tab panels take focus, so they need a visible focus ring. */
export const PANEL =
  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

const TABS: { id: OptionTab; label: string }[] = [
  { id: "shape", label: "Shape" },
  { id: "rules", label: "Rules" },
  { id: "customise", label: "Customise" },
  { id: "cost", label: "Cost" },
  { id: "return", label: "Return" },
];

export function printSummary() {
  window.print();
}

const NO_LEVELS: readonly number[] = [];

function ShapeTab({ scene, design }: { scene: Scene; design: AnyDesign }) {
  const selectedFloor = useResultsView((s) => s.selectedFloor);
  const build = useStudio((s) => s.builds[design.id as `custom-${string}`]);
  const breaches = build?.breaches ?? NO_LEVELS;
  const envelope =
    design.envelope === "highRise"
      ? (scene.result.envelopes.highRise ?? scene.result.envelopes.lowRise)
      : scene.result.envelopes.lowRise;
  const isVariant = design.id.startsWith("custom-");
  return (
    <div className="grid gap-4" data-testid="shape-tab">
      <dl className="grid grid-cols-3 gap-3 rounded-xl border bg-card p-3.5">
        <div>
          <dt className="text-muted-foreground text-xs">Floor area</dt>
          <dd className="font-mono font-semibold tabular">{formatArea(design.gfaM2)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Height · storeys</dt>
          <dd className="font-mono font-semibold tabular">
            {formatLength(design.heightM)} · {formatInt(design.floors.length)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Footprint</dt>
          <dd className="font-mono font-semibold tabular">{formatArea(design.footprintM2)}</dd>
        </div>
      </dl>
      <SectionPreview
        design={design}
        input={scene.input}
        envelope={envelope}
        selected={selectedFloor === null ? [] : [selectedFloor]}
        breaches={breaches}
        onSelect={(levels) => {
          const view = useResultsView.getState();
          const level = levels[0] ?? null;
          view.setSelectedFloor(view.selectedFloor === level && levels.length === 1 ? null : level);
          if (isVariant) useStudio.getState().setSelection({ levels, anchor: levels[0] ?? null });
        }}
      />
      <FloorSchedule design={design} />
      <div className="flex flex-wrap gap-2">
        {!isVariant && (
          <Button size="sm" onClick={() => customise(design)}>
            <SlidersHorizontal /> Customise
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => downloadSchedule(design)}>
          <Download /> Floor schedule (CSV)
        </Button>
        <Button variant="outline" size="sm" onClick={printSummary}>
          <Printer /> Print summary
        </Button>
      </div>
    </div>
  );
}

/** Step 3: one card per way to build it, then the selected option in tabs. */
export function OptionsStep() {
  const { state, scene, entries, recommended } = useOptions();
  const selected = useResultsView((s) => s.selectedDesign);
  const tab = useResultsView((s) => s.optionTab);
  const design = scene?.design ?? null;

  useEffect(() => {
    if (!scene || selected !== null) return;
    const first = recommended ?? entries[0]?.id ?? null;
    const entry = entries.find((e) => e.id === first);
    if (first && entry?.design)
      useResultsView.getState().selectDesign(first, entry.design.envelope);
  }, [scene, selected, recommended, entries]);

  if (!scene) {
    return (
      <div className="p-5">
        <EngineGuidance state={state} />
      </div>
    );
  }
  const generated = entries.filter((e) => e.kind === "generated").length;
  const own = entries.length - generated;

  return (
    <div className="grid gap-5 p-5" data-testid="options-step">
      <section aria-labelledby="ways-title" className="grid gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="ways-title" className="font-semibold text-base">
            Ways to build it
          </h2>
          <p className="text-muted-foreground text-xs">
            {generated} options{own > 0 ? ` · ${own} yours` : ""}
          </p>
        </div>
        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
            No concept design fits inside the allowed space on this plot. Enlarge the plot, or check
            the road width and the rule switches in Site and rules.
          </p>
        ) : (
          <ul className="grid gap-2.5" data-testid="designs">
            {entries.map((entry) => (
              <li key={entry.id}>
                <OptionCard
                  entry={entry}
                  input={scene.input}
                  selected={entry.id === selected}
                  recommended={entry.id === recommended}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="lg:hidden">
        <ComparisonCards />
      </div>

      {design && (
        <Tabs
          value={tab}
          onValueChange={(v) => useResultsView.getState().setOptionTab(v as OptionTab)}
          className="gap-4"
        >
          <TabsList className="w-full">
            {TABS.map(({ id, label }) => (
              <TabsTrigger key={id} value={id} className={cn(id === "rules" && "gap-1")}>
                {label}
                {id === "rules" && !design.passes && (
                  <span aria-hidden className="size-1.5 rounded-full bg-fail" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="shape" className={PANEL}>
            <ShapeTab scene={scene} design={design} />
          </TabsContent>
          <TabsContent value="rules" className={cn(PANEL, "grid gap-3")}>
            <p className="text-muted-foreground text-sm">
              <span className={cn("font-medium", design.passes ? "text-pass" : "text-fail")}>
                {design.passes ? "Passes" : "Fails"}
              </span>{" "}
              · {countsText(design.checks)}
            </p>
            <Checklist checks={design.checks} />
          </TabsContent>
          <TabsContent value="customise" className={PANEL}>
            <CustomiseTab scene={scene} design={design} onPrint={printSummary} />
          </TabsContent>
          <TabsContent value="cost" className={PANEL}>
            <CostTab design={design} input={scene.input} />
          </TabsContent>
          <TabsContent value="return" className={PANEL}>
            <ReturnTab design={design} input={scene.input} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
