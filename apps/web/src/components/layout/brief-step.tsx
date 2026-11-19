"use client";

import { BUILDING_TYPE_INFO, BUILDING_TYPES, type BuildingType } from "@envelope/engine";
import { Button } from "@envelope/ui/components/button";
import { cn } from "@envelope/ui/lib/utils";
import { ArrowRight, BedDouble, Building2, Home } from "lucide-react";
import { usePlotStore } from "@/lib/plot/store";
import { useResultsView } from "@/lib/results/view";
import { NOTICE } from "./top-bar";

const ICON = { condo: Home, office: Building2, hotel: BedDouble } as const;
const BLURB: Record<BuildingType, string> = {
  condo: "Homes for sale. Parking by unit count, 30% open ground for a high-rise.",
  office: "Floors to let. Parking per 60 m² of office, taller floor heights.",
  hotel: "Rooms to run. Room count and size caps by zone and road.",
};

/** Step 1: what the developer wants to build. */
export function BriefStep() {
  const type = usePlotStore((s) => s.settings.buildingType);
  return (
    <div className="grid gap-6 p-5" data-testid="brief-step">
      <section className="grid gap-2">
        <h2 className="font-semibold text-base">What do you want to build?</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Pick a building type. The tool then checks your plot against the Bangkok rules that apply,
          draws the space you may fill, and suggests ways to build it that you can edit.
        </p>
      </section>
      <div role="radiogroup" aria-label="Building type" className="grid gap-2">
        {BUILDING_TYPES.map((t) => {
          const Icon = ICON[t];
          const active = t === type;
          return (
            // biome-ignore lint/a11y/useSemanticElements: a card-sized radio choice
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => usePlotStore.getState().setBuildingType(t)}
              className={cn(
                "flex items-start gap-3 rounded-xl border bg-card p-3.5 text-left transition-colors hover:border-foreground/25 focus-visible:outline-2 focus-visible:outline-ring",
                active && "border-primary shadow-[0_0_0_1px_var(--primary)]",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-lg",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4.5" />
              </span>
              <span className="grid gap-0.5">
                <span className="font-medium text-sm">{BUILDING_TYPE_INFO[t].name}</span>
                <span className="text-muted-foreground text-xs leading-snug">{BLURB[t]}</span>
              </span>
            </button>
          );
        })}
      </div>
      <ol className="grid gap-2 rounded-xl border border-dashed p-4 text-sm">
        <li className="flex gap-2">
          <span className="font-mono text-muted-foreground">1</span> Brief: the building type.
        </li>
        <li className="flex gap-2">
          <span className="font-mono text-muted-foreground">2</span> Site and rules: draw the plot,
          mark the roads, check the zone and the rules.
        </li>
        <li className="flex gap-2">
          <span className="font-mono text-muted-foreground">3</span> Options: compare the ways to
          build it, then customise one.
        </li>
      </ol>
      <p className="text-muted-foreground text-xs">{NOTICE}</p>
      <Button className="w-fit" onClick={() => useResultsView.getState().setStep("site")}>
        Site and rules <ArrowRight />
      </Button>
    </div>
  );
}
