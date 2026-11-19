"use client";

import { useMemo } from "react";
import type { EngineState } from "@/lib/engine/store";
import { useEngineResult } from "@/lib/engine/use-engine-result";
import { type Scene, sceneFor } from "./scene";
import { useResultsView } from "./view";

/** The engine state and, when the plot evaluated, everything the panels show for it. */
export function useScene(): { state: EngineState; scene: Scene | null } {
  const state = useEngineResult();
  const envelopeKind = useResultsView((s) => s.envelopeKind);
  const selectedDesign = useResultsView((s) => s.selectedDesign);
  const scene = useMemo(
    () => sceneFor(state, { envelopeKind, selectedDesign }),
    [state, envelopeKind, selectedDesign],
  );
  return { state, scene };
}
