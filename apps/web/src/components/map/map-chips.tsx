"use client";

import { Button } from "@envelope/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@envelope/ui/components/popover";
import { Switch } from "@envelope/ui/components/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@envelope/ui/components/tooltip";
import { Layers, RotateCcw } from "lucide-react";
import { useAsBuilt } from "@/lib/scene/as-built";
import { type SceneToggles, useSceneView } from "@/lib/scene/view";

const TOGGLES: { key: keyof SceneToggles; label: string; hint: string }[] = [
  { key: "heightLimit", label: "Allowed envelope", hint: "The space the rules let you fill" },
  { key: "setback", label: "Setbacks", hint: "The strip kept clear along each road" },
  { key: "asBuilt", label: "Existing building", hint: "What stands on the plot today" },
];

/** What the map shows, in one menu, and a way back to the starting view. */
export function MapLayers({ onReset }: { onReset: () => void }) {
  const toggles = useSceneView((s) => s.layers);
  const asBuiltCount = useAsBuilt((s) => s.buildings.length);
  return (
    <>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="icon" aria-label="Map layers">
                <Layers />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Map layers</TooltipContent>
        </Tooltip>
        <PopoverContent align="start" className="grid w-64 gap-1 p-2" data-testid="map-layers">
          {TOGGLES.map(({ key, label, hint }) => {
            const empty = key === "asBuilt" && asBuiltCount === 0;
            const id = `layer-${key}`;
            return (
              <label
                key={key}
                htmlFor={id}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted has-disabled:cursor-default has-disabled:opacity-50"
              >
                <span className="grid flex-1 gap-0.5">
                  <span className="font-medium text-sm">{label}</span>
                  <span className="text-muted-foreground text-xs">
                    {empty ? "No mapped building on this plot" : hint}
                  </span>
                </span>
                <Switch
                  id={id}
                  checked={toggles[key]}
                  disabled={empty}
                  onCheckedChange={(on) => useSceneView.getState().setLayer(key, on)}
                />
              </label>
            );
          })}
        </PopoverContent>
      </Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="secondary" size="icon" onClick={onReset} aria-label="Reset view">
            <RotateCcw />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Back to the starting view</TooltipContent>
      </Tooltip>
    </>
  );
}
