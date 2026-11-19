"use client";

import { useMemo } from "react";
import type { EngineState } from "@/lib/engine/store";
import { useEngineResult } from "@/lib/engine/use-engine-result";
import type { SiteHold } from "@/lib/plot/clearance";
import { useSiteHold } from "@/lib/plot/use-site-hold";
import { type Scene, sceneFor } from "./scene";
import { useResultsView } from "./view";

/**
 * The engine state and, when the plot evaluated, everything the panels show for it. No scene
 * while the plot waits for the user to confirm its existing buildings will be demolished.
 */
export function useScene(): { state: EngineState; scene: Scene | null; hold: SiteHold } {
  const state = useEngineResult();
  const hold = useSiteHold();
  const envelopeKind = useResultsView((s) => s.envelopeKind);
  const selectedDesign = useResultsView((s) => s.selectedDesign);
  const customDesigns = useResultsView((s) => s.customDesigns);
  const scene = useMemo(
    () => (hold.held ? null : sceneFor(state, { envelopeKind, selectedDesign, customDesigns })),
    [hold.held, state, envelopeKind, selectedDesign, customDesigns],
  );
  return { state, scene, hold };
}
