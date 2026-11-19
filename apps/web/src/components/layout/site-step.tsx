"use client";

import { Button } from "@envelope/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@envelope/ui/components/tabs";
import { cn } from "@envelope/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import { PlotPanel } from "@/components/panel/plot-panel";
import { useScene } from "@/lib/results/use-scene";
import { type SiteTab, useResultsView } from "@/lib/results/view";
import { EngineGuidance } from "../results/engine-guidance";
import { PANEL } from "../results/options-step";
import { RulesTab } from "../results/rules-tab";

/** Step 2: the plot inputs and the rules that apply to it. */
export function SiteStep() {
  const tab = useResultsView((s) => s.siteTab);
  const { state, scene } = useScene();
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => useResultsView.getState().setSiteTab(v as SiteTab)}
      className="gap-0"
      data-testid="site-step"
    >
      <div className="sticky top-0 z-10 border-b bg-background/95 px-5 py-2.5 backdrop-blur">
        <TabsList className="w-full">
          <TabsTrigger value="plot">Plot</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="plot" forceMount className={cn(PANEL, "data-[state=inactive]:hidden")}>
        <PlotPanel />
      </TabsContent>
      <TabsContent
        value="rules"
        forceMount
        className={cn(PANEL, "p-5 data-[state=inactive]:hidden")}
      >
        {scene ? <RulesTab scene={scene} /> : <EngineGuidance state={state} />}
      </TabsContent>
      {scene && (
        <div className="px-5 pb-6">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => useResultsView.getState().setStep("options")}
          >
            See the ways to build it <ArrowRight />
          </Button>
        </div>
      )}
    </Tabs>
  );
}
