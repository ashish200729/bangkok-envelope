"use client";

import { useEffect, useMemo, useState } from "react";
import type { EngineState } from "@/lib/engine/store";
import { useEngineResult } from "@/lib/engine/use-engine-result";
import { fixtureFlag } from "./fixtures";
import { type Scene, sceneFor } from "./scene";
import { useResultsView } from "./view";

/** The engine state and, when the plot evaluated, everything the panels show for it. */
export function useScene(): { state: EngineState; scene: Scene | null } {
  const state = useEngineResult();
  const envelopeKind = useResultsView((s) => s.envelopeKind);
  const selectedDesign = useResultsView((s) => s.selectedDesign);
  const [useFixtures, setUseFixtures] = useState(false);
  useEffect(() => setUseFixtures(fixtureFlag()), []);
  const scene = useMemo(
    () => sceneFor(state, { envelopeKind, selectedDesign }, useFixtures),
    [state, envelopeKind, selectedDesign, useFixtures],
  );
  return { state, scene };
}
