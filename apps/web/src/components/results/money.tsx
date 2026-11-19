"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@envelope/ui/components/tabs";
import { useResultsView } from "@/lib/results/view";
import { entryName } from "@/lib/studio/options";
import { useOptions } from "@/lib/studio/use-options";
import { SchemeBadge } from "./bits";
import { CostTab } from "./cost-tab";
import { EngineGuidance } from "./engine-guidance";
import { ReturnTab } from "./return-tab";

/** What the selected scheme would cost to build, what it is worth and what that leaves for land. */
export function MoneySection() {
  const { state, scene, entries } = useOptions();
  const selected = useResultsView((s) => s.selectedDesign);
  if (!scene) return <EngineGuidance state={state} />;
  const design = scene.design;
  const entry = entries.find((e) => e.id === selected);
  if (!design || !entry) {
    return <p className="text-muted-foreground text-sm">Pick a scheme to see its figures.</p>;
  }
  return (
    <div className="grid gap-4" data-testid="money-section">
      <p className="flex items-center gap-2 text-sm">
        <SchemeBadge badge={entry.badge} custom={entry.kind === "variant"} small />
        <span className="font-medium">{entryName(entry)}</span>
      </p>
      <Tabs defaultValue="value" className="gap-4">
        <TabsList className="w-full">
          <TabsTrigger value="value">Value</TabsTrigger>
          <TabsTrigger value="cost">Cost</TabsTrigger>
        </TabsList>
        <TabsContent value="value">
          <ReturnTab design={design} input={scene.input} />
        </TabsContent>
        <TabsContent value="cost">
          <CostTab design={design} input={scene.input} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
