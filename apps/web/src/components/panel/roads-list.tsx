"use client";

import type { Road } from "@envelope/engine";
import { Button } from "@envelope/ui/components/button";
import { Label } from "@envelope/ui/components/label";
import { cn } from "@envelope/ui/lib/utils";
import { ROAD_WIDTH_RULE } from "@/lib/plot/number-input";
import { usePlotStore } from "@/lib/plot/store";
import { acceptRoadSuggestion } from "@/lib/site/actions";
import { roadSuggestionText, WIDTH_PROVENANCE } from "@/lib/site/suggest";
import { useSiteSuggestions } from "@/lib/site/use-suggestions";
import { NumberField } from "./number-field";

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
            <WidthInput road={road} />
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

function WidthInput({ road }: { road: Road }) {
  return (
    <NumberField
      id={`road-${road.id}`}
      value={road.widthM}
      rule={ROAD_WIDTH_RULE}
      step={0.5}
      unit="m"
      describe={(value) => `${value} m`}
      onValue={(value) => {
        if (value !== null) usePlotStore.getState().setRoadWidth(road.id, value);
      }}
    />
  );
}
