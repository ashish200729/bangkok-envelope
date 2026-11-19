"use client";

import { BUILDING_TYPE_INFO, ZONES } from "@envelope/engine";
import { Button } from "@envelope/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@envelope/ui/components/tabs";
import { cn } from "@envelope/ui/lib/utils";
import { PencilLine } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PlotMapLoader } from "@/components/map/plot-map-loader";
import { PlotPanel } from "@/components/panel/plot-panel";
import { useEngineResult } from "@/lib/engine/use-engine-result";
import { usePlotStore } from "@/lib/plot/store";
import { formatArea } from "@/lib/results/format";
import { NOTICE } from "@/lib/results/notice";
import { useScene } from "@/lib/results/use-scene";
import { type Section, useResultsView } from "@/lib/results/view";
import { useSiteSync } from "@/lib/site/use-site-sync";
import { useFeasibility } from "@/lib/studio/feasibility";
import { useStudio, variantById } from "@/lib/studio/store";
import { startStudio } from "@/lib/studio/sync";
import { ComparePanel } from "../results/compare";
import { EngineGuidance } from "../results/engine-guidance";
import { MoneySection } from "../results/money";
import { RulesTab } from "../results/rules-tab";
import { SchemesSection } from "../results/schemes";
import { PrintSummary } from "../studio/print-summary";
import { ThemeToggle } from "../theme-toggle";

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

export function startOver() {
  const view = useResultsView.getState();
  view.setSection("plot");
  view.selectDesign(null);
  usePlotStore.getState().startDrawing();
}

/** "3,490 m² · ย.10 · Condominium": what is being studied, at a glance. */
function PlotSummary() {
  const { scene } = useScene();
  const zone = usePlotStore((s) => s.settings.zone);
  const type = usePlotStore((s) => s.settings.buildingType);
  const parts = [
    scene ? formatArea(scene.result.plotAreaM2) : null,
    ZONES[zone].labelTh,
    BUILDING_TYPE_INFO[type].name,
  ].filter(Boolean);
  return (
    <p
      className="hidden truncate font-mono text-muted-foreground text-xs tabular sm:block"
      data-testid="study-location"
    >
      {parts.join(" · ")}
    </p>
  );
}

function Header() {
  const drawing = usePlotStore((s) => s.mode === "draw");
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-background px-4">
      <span aria-hidden className="size-3.5 shrink-0 rounded-[3px] border-[1.5px] border-primary" />
      <h1 className="truncate font-semibold text-sm tracking-tight">Bangkok Plot Envelope</h1>
      <span aria-hidden className="hidden h-4 w-px bg-border sm:block" />
      <PlotSummary />
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={drawing} onClick={startOver}>
          <PencilLine /> New plot
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}

/** Radix tab panels take focus, so they need a visible focus ring. */
const PANEL =
  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

const SECTION_LABEL: Record<Section, string> = {
  plot: "Plot",
  rules: "Rules",
  schemes: "Schemes",
  money: "Money",
};

/** The panels on the right: the plot inputs, the rules, the schemes and their money. */
function Inspector({ onCompare }: { onCompare: () => void }) {
  const section = useResultsView((s) => s.section);
  const { state, scene } = useScene();
  const failing = scene?.design?.passes === false;
  return (
    <Tabs
      value={section}
      onValueChange={(v) => useResultsView.getState().setSection(v as Section)}
      className="min-h-0 gap-0 lg:h-full"
    >
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-2.5">
        <TabsList className="w-full" aria-label="Sections">
          {(Object.keys(SECTION_LABEL) as Section[]).map((id) => (
            <TabsTrigger key={id} value={id} className="gap-1.5">
              {SECTION_LABEL[id]}
              {id === "schemes" && failing && (
                <span aria-hidden className="size-1.5 rounded-full bg-fail" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className="min-h-0 flex-1 lg:overflow-y-auto" data-testid="left-column">
        <TabsContent value="plot" forceMount className={cn(PANEL, "data-[state=inactive]:hidden")}>
          <PlotPanel />
        </TabsContent>
        <TabsContent value="rules" className={cn(PANEL, "p-4")}>
          {scene ? <RulesTab scene={scene} /> : <EngineGuidance state={state} />}
        </TabsContent>
        <TabsContent value="schemes" className={cn(PANEL, "p-4")}>
          <SchemesSection onCompare={onCompare} />
        </TabsContent>
        <TabsContent value="money" className={cn(PANEL, "p-4")}>
          <MoneySection />
        </TabsContent>
        <p
          className="px-4 pt-2 pb-6 text-[11px] text-muted-foreground leading-relaxed"
          data-testid="honest-notice"
        >
          {NOTICE}
        </p>
      </div>
    </Tabs>
  );
}

/** The tool: the map fills the screen; one inspector on the right (below the map on phones). */
export function AppShell() {
  useEngineResult();
  useSiteSync();
  useUndoShortcuts();
  useEffect(() => {
    useFeasibility.getState().load();
    return startStudio();
  }, []);
  const [comparing, setComparing] = useState(false);
  const closeCompare = useCallback(() => setComparing(false), []);
  const drawing = usePlotStore((s) => s.mode === "draw");

  return (
    <>
      <div className="flex min-h-dvh flex-col lg:h-dvh print:hidden">
        <Header />
        <main className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_400px]">
          <section aria-label="Map" className="relative h-[52dvh] shrink-0 lg:h-auto lg:min-h-0">
            <PlotMapLoader />
            {comparing && !drawing && <ComparePanel onClose={closeCompare} />}
          </section>
          <aside
            aria-label="Inspector"
            className="flex flex-col border-t lg:min-h-0 lg:border-t-0 lg:border-l"
          >
            <Inspector onCompare={() => setComparing((v) => !v)} />
          </aside>
        </main>
      </div>
      <PrintSummary />
    </>
  );
}
