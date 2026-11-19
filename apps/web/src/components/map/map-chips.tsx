"use client";

import type { FloorUse } from "@envelope/engine";
import { cn } from "@envelope/ui/lib/utils";
import { RotateCcw } from "lucide-react";
import { floorUseColor, floorUses } from "@/lib/results/designs";
import { useScene } from "@/lib/results/use-scene";
import { useAsBuilt } from "@/lib/scene/as-built";
import { type SceneToggles, useSceneView } from "@/lib/scene/view";

const CHIP =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-background/95 px-3 font-medium text-xs shadow-sm backdrop-blur transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const ON = "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15";

const TOGGLES: { key: keyof SceneToggles; label: string; hint: string }[] = [
  { key: "setback", label: "Setback", hint: "Show the setback band and distances" },
  { key: "heightLimit", label: "Height limit", hint: "Show the allowed envelope as a ghost" },
  { key: "asBuilt", label: "As built", hint: "Show the building on the plot today, ghosted" },
];

/** Map toggles as chips: setback, height limit, the building there today, and a view reset. */
export function MapChips({ onReset }: { onReset: () => void }) {
  const toggles = useSceneView((s) => s.layers);
  const asBuiltCount = useAsBuilt((s) => s.buildings.length);
  return (
    <>
      {TOGGLES.map(({ key, label, hint }) => {
        const on = toggles[key];
        const empty = key === "asBuilt" && asBuiltCount === 0;
        return (
          <button
            key={key}
            type="button"
            title={empty ? "No mapped building stands on this plot" : hint}
            aria-pressed={on}
            disabled={empty}
            onClick={() => useSceneView.getState().setLayer(key, !on)}
            className={cn(CHIP, on && ON, empty && "pointer-events-none opacity-50")}
          >
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", on ? "bg-primary" : "bg-muted-foreground/40")}
            />
            {label}
          </button>
        );
      })}
      <button type="button" onClick={onReset} className={CHIP} title="Back to the starting view">
        <RotateCcw className="size-3.5" aria-hidden />
        Reset view
      </button>
    </>
  );
}

/** The uses of the shown design, with their massing colours. */
export function MapLegend() {
  const { scene } = useScene();
  const design = scene?.design;
  if (!design) return null;
  const uses: FloorUse[] = floorUses(design);
  return (
    <ul
      aria-label="Floor uses"
      data-testid="map-legend"
      className="pointer-events-none absolute bottom-9 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-x-3 gap-y-1 rounded-lg border bg-background/90 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur"
    >
      {uses.map((use) => (
        <li key={use} className="flex items-center gap-1.5 capitalize">
          <span
            aria-hidden
            className="size-2.5 rounded-[3px] ring-1 ring-black/10"
            style={{ background: floorUseColor(use) }}
          />
          {use}
        </li>
      ))}
    </ul>
  );
}
