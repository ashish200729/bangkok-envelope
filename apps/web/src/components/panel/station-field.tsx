"use client";

import { Button } from "@envelope/ui/components/button";
import { Input } from "@envelope/ui/components/input";
import { Label } from "@envelope/ui/components/label";
import { TrainFront } from "lucide-react";
import { usePlotStore } from "@/lib/plot/store";
import { resetToDetectedStation, typeStationDistance } from "@/lib/site/actions";
import { currentContext } from "@/lib/site/request";
import { useSiteStore } from "@/lib/site/store";
import { stationDistanceM, stationLabel } from "@/lib/site/suggest";

export function StationField() {
  const distance = usePlotStore((s) => s.settings.stationDistanceM);
  const source = useSiteStore((s) => s.station);
  const request = useSiteStore((s) => s.request);
  const station = currentContext(request)?.nearestStation ?? null;
  const differs = station !== null && stationDistanceM(station) !== distance;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="station-distance">Distance to nearest BTS/MRT station</Label>
      <div className="flex items-center gap-2">
        <Input
          id="station-distance"
          type="number"
          inputMode="numeric"
          min={0}
          step={10}
          placeholder="Unknown"
          value={distance ?? ""}
          onChange={(e) => {
            const value = e.target.value === "" ? null : Number(e.target.value);
            if (value === null || (Number.isFinite(value) && value >= 0)) {
              typeStationDistance(value);
            }
          }}
        />
        <span className="text-muted-foreground text-sm">m</span>
      </div>
      {station && (
        <div
          className="flex min-h-6 items-center justify-between gap-2 text-xs"
          data-testid="station-detected"
        >
          <p className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <TrainFront className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {source === "user" && differs ? "Detected: " : ""}
              {stationLabel(station)}
            </span>
          </p>
          {source === "user" && differs && (
            <Button variant="outline" size="xs" onClick={resetToDetectedStation}>
              Use detected
            </Button>
          )}
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        Within 500 m of a station, some size limits for offices and hotels are relaxed.
      </p>
    </div>
  );
}
