"use client";

import { Button } from "@envelope/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@envelope/ui/components/tooltip";
import { cn } from "@envelope/ui/lib/utils";
import { Moon, Sun } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { formatHour } from "@/lib/scene/sun";
import { SUN_HOUR_MAX, SUN_HOUR_MIN, SUN_PRESETS, useSceneView } from "@/lib/scene/view";

/** Sun (date and hour) and night view, next to the fit and 2D/3D buttons. */
export function SceneControls() {
  const date = useSceneView((s) => s.date);
  const hour = useSceneView((s) => s.hour);
  const night = useSceneView((s) => s.night);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const { setDate, setHour, setNight } = useSceneView.getState();

  return (
    <div ref={root} className="relative flex gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="font-mono tabular"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`Sun position: ${formatHour(hour)}, ${date}`}
            onClick={() => setOpen((o) => !o)}
          >
            <Sun />
            {formatHour(hour)}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Sun and time of day</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={night ? "default" : "secondary"}
            size="icon"
            aria-pressed={night}
            aria-label="Night view"
            onClick={() => setNight(!night)}
          >
            <Moon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {night ? "Back to daylight" : "Night view: every floor lit"}
        </TooltipContent>
      </Tooltip>

      {open && (
        <fieldset
          id={panelId}
          aria-label="Sun and time"
          className="absolute top-10 left-0 z-20 w-[min(17rem,calc(100vw-2rem))] rounded-lg border bg-popover p-3 text-popover-foreground text-sm shadow-lg"
        >
          <label className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 font-mono text-xs tabular"
            />
          </label>
          <label className="mt-3 block">
            <span className="flex items-center justify-between">
              <span className="text-muted-foreground">Time (Bangkok)</span>
              <span className="font-mono tabular" data-testid="sun-hour">
                {formatHour(hour)}
              </span>
            </span>
            <input
              type="range"
              aria-label="Hour of day"
              min={SUN_HOUR_MIN}
              max={SUN_HOUR_MAX}
              step={0.25}
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="mt-2 w-full accent-primary"
            />
          </label>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {SUN_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setHour(preset.hour)}
                aria-pressed={hour === preset.hour}
                className={cn(
                  "rounded-md border px-1 py-1 font-mono text-xs tabular transition-colors hover:bg-muted",
                  hour === preset.hour && "border-primary bg-primary/10 text-primary",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-muted-foreground text-xs">
            Daylight from the sun's real position over the plot.
          </p>
        </fieldset>
      )}
    </div>
  );
}
