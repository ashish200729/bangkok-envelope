"use client";

import { Button } from "@envelope/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@envelope/ui/components/tooltip";
import { Moon } from "lucide-react";
import { useSceneView } from "@/lib/scene/view";

/**
 * Night view, next to the fit and 2D/3D buttons. Daylight is a fixed Bangkok afternoon
 * (lib/scene/view.ts); there is no time-of-day picker (decision 62).
 */
export function SceneControls() {
  const night = useSceneView((s) => s.night);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={night ? "default" : "secondary"}
          size="icon"
          aria-pressed={night}
          aria-label="Night view"
          onClick={() => useSceneView.getState().setNight(!night)}
        >
          <Moon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{night ? "Back to daylight" : "Night view: every floor lit"}</TooltipContent>
    </Tooltip>
  );
}
