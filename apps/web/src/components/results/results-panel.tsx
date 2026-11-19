"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@envelope/ui/components/tabs";
import { cn } from "@envelope/ui/lib/utils";
import { PlotPanel } from "@/components/panel/plot-panel";
import { useScene } from "@/lib/results/use-scene";
import { type PanelTab, useResultsView } from "@/lib/results/view";
import { DesignsTab } from "./designs-tab";
import { EngineGuidance } from "./engine-guidance";
import { RulesTab } from "./rules-tab";

/** Tab panels take focus (Radix gives them tabIndex 0), so they need a visible focus ring. */
const PANEL =
  "data-[state=inactive]:hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

const TABS: { id: PanelTab; label: string }[] = [
  { id: "plot", label: "Plot" },
  { id: "rules", label: "Rules" },
  { id: "designs", label: "Designs" },
];

/** The right column: the plot inputs, the rules that apply and the concept designs, as tabs. */
export function ResultsPanel() {
  const tab = useResultsView((s) => s.tab);
  const { state, scene } = useScene();
  const designCount = scene?.result.designs.length ?? 0;
  const updating = state.status === "computing" && state.previous !== null;

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => useResultsView.getState().setTab(v as PanelTab)}
      className="gap-0"
    >
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 px-5 py-2.5 backdrop-blur">
        <TabsList className="w-full">
          {TABS.map(({ id, label }) => (
            <TabsTrigger key={id} value={id}>
              {label}
              {id === "designs" && designCount > 0 && (
                <span className="font-mono text-muted-foreground text-xs tabular">
                  {designCount}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <span
          aria-live="polite"
          data-testid="engine-status"
          data-status={state.status}
          className="sr-only"
        >
          {updating ? "Updating results" : ""}
        </span>
      </div>
      <TabsContent value="plot" forceMount className={PANEL}>
        <PlotPanel />
      </TabsContent>
      <TabsContent value="rules" forceMount className={cn(PANEL, "p-5")}>
        {scene ? <RulesTab scene={scene} /> : <EngineGuidance state={state} />}
      </TabsContent>
      <TabsContent value="designs" forceMount className={cn(PANEL, "p-5")}>
        {scene ? <DesignsTab scene={scene} /> : <EngineGuidance state={state} />}
      </TabsContent>
    </Tabs>
  );
}
