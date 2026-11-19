"use client";

import { useEffect, useState } from "react";
import { PlotMapLoader } from "@/components/map/plot-map-loader";
import { useEngineResult } from "@/lib/engine/use-engine-result";
import { useResultsView } from "@/lib/results/view";
import { useSiteSync } from "@/lib/site/use-site-sync";
import { useFeasibility } from "@/lib/studio/feasibility";
import { useStudio, variantById } from "@/lib/studio/store";
import { startStudio } from "@/lib/studio/sync";
import { ComparisonStrip } from "../results/comparison";
import { OptionsStep } from "../results/options-step";
import { PrintSummary } from "../studio/print-summary";
import { BriefStep } from "./brief-step";
import { SiteStep } from "./site-step";
import { TopBar } from "./top-bar";

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable ||
    (el instanceof HTMLInputElement &&
      !["checkbox", "radio", "range", "button"].includes(el.type)) ||
    el instanceof HTMLTextAreaElement);

/** Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z (or Ctrl+Y) undo and redo the selected variant. */
function useUndoShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || isTextField(e.target)) return;
      const key = e.key.toLowerCase();
      const redo = (key === "z" && e.shiftKey) || key === "y";
      if (key !== "z" && key !== "y") return;
      const id = useResultsView.getState().selectedDesign;
      const studio = useStudio.getState();
      const variant = variantById(studio.variants, id);
      if (!variant) return;
      e.preventDefault();
      if (redo) studio.redo(variant.id);
      else studio.undo(variant.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/**
 * The tool: top bar with the three steps; the step's column on the left (below the map on
 * phones); the map on the right with the options compared underneath. The map stays in view
 * on every step.
 */
export function AppShell() {
  useEngineResult();
  useSiteSync();
  useUndoShortcuts();
  useEffect(() => {
    useFeasibility.getState().load();
    return startStudio();
  }, []);
  const step = useResultsView((s) => s.step);
  const [compareOpen, setCompareOpen] = useState(true);

  return (
    <>
      <div className="flex min-h-dvh flex-col lg:h-dvh print:hidden">
        <TopBar />
        <main className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[420px_minmax(0,1fr)]">
          <section
            aria-label="Map"
            className="order-1 flex shrink-0 flex-col lg:order-2 lg:min-h-0"
          >
            <div className="relative h-[46dvh] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1">
              <PlotMapLoader />
            </div>
            {step === "options" && (
              <div className="hidden lg:block">
                <ComparisonStrip open={compareOpen} onOpenChange={setCompareOpen} />
              </div>
            )}
          </section>
          <aside
            aria-label="Study"
            className="order-2 border-t lg:order-1 lg:overflow-y-auto lg:border-t-0 lg:border-r"
            data-testid="left-column"
          >
            <div hidden={step !== "brief"}>
              <BriefStep />
            </div>
            <div hidden={step !== "site"}>
              <SiteStep />
            </div>
            <div hidden={step !== "options"}>
              <OptionsStep />
            </div>
          </aside>
        </main>
      </div>
      <PrintSummary />
    </>
  );
}
