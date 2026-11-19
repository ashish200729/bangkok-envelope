"use client";

import { useMemo } from "react";
import { useScene } from "@/lib/results/use-scene";
import { type OptionEntry, optionEntries, recommendedEntry } from "./options";
import { useStudio } from "./store";

/** Every option card (generated and the user's variants) for the current plot. */
export function useOptions() {
  const { state, scene } = useScene();
  const variants = useStudio((s) => s.variants);
  const builds = useStudio((s) => s.builds);
  const entries: OptionEntry[] = useMemo(
    () => (scene ? optionEntries(scene.result.designs, variants, builds) : []),
    [scene, variants, builds],
  );
  const recommended = useMemo(() => recommendedEntry(entries), [entries]);
  return { state, scene, entries, recommended };
}
