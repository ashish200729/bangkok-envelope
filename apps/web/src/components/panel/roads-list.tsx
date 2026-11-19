"use client";

import type { Road } from "@envelope/engine";
import { Button } from "@envelope/ui/components/button";
import { Input } from "@envelope/ui/components/input";
import { Label } from "@envelope/ui/components/label";
import { cn } from "@envelope/ui/lib/utils";
import { useState } from "react";
import { usePlotStore } from "@/lib/plot/store";
import { acceptRoadSuggestion } from "@/lib/site/actions";
import { roadSuggestionText, WIDTH_PROVENANCE } from "@/lib/site/suggest";
import { useSiteSuggestions } from "@/lib/site/use-suggestions";

export function RoadsList() {
  const roads = usePlotStore((s) => s.roads);
  const suggestions = useSiteSuggestions().roads;
  return (
    <div className="grid gap-4">
      {roads.map((road) => {
        const suggestion = suggestions.get(road.id);
        return (
          <div key={road.id} className="grid gap-1.5" data-testid="road">
            <Label htmlFor={`road-${road.id}`}>{road.name ?? "Road"} width</Label>
            <div className="flex items-center gap-2">
              <WidthInput road={road} />
              <span className="text-muted-foreground text-sm">m</span>
            </div>
            <p
              className={cn(
                "text-xs",
                road.widthSource === "osm-estimate" ? "text-warn" : "text-muted-foreground",
              )}
              data-testid="road-width-source"
            >
              Width {WIDTH_PROVENANCE[road.widthSource]}
            </p>
            {suggestion && (
              <div
                className="flex items-center justify-between gap-3 rounded-md border bg-muted/50 px-2.5 py-2"
                data-testid="road-suggestion"
              >
                <p className="text-xs">{roadSuggestionText(suggestion)}</p>
                <Button
                  variant="outline"
                  size="xs"
                  aria-label={`Apply the OpenStreetMap name and width to ${road.name ?? "this road"}`}
                  onClick={() => acceptRoadSuggestion(road.id, suggestion)}
                >
                  Apply
                </Button>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-muted-foreground text-xs">
        Legal road width (เขตทาง): from property line to property line, including footpaths and
        drains.
      </p>
    </div>
  );
}

/** Keeps the typed text (for example "8.") while following widths set elsewhere. */
function WidthInput({ road }: { road: Road }) {
  const [text, setText] = useState(String(road.widthM));
  const [shown, setShown] = useState(road.widthM);
  if (road.widthM !== shown) {
    setShown(road.widthM);
    setText(String(road.widthM));
  }
  return (
    <Input
      id={`road-${road.id}`}
      type="number"
      inputMode="decimal"
      min={1}
      max={200}
      step={0.5}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const value = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(value) && value > 0 && value <= 200) {
          setShown(value);
          usePlotStore.getState().setRoadWidth(road.id, value);
        }
      }}
    />
  );
}
