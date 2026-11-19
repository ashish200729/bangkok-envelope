"use client";

import type { CustomDesignId, DesignSpec } from "@envelope/engine";
import { useCallback } from "react";
import { useResultsView } from "@/lib/results/view";
import { baselineFor } from "./options";
import { useStudio, variantById } from "./store";

/** Everything the editor needs about one variant, and its edit helpers. */
export function useVariant(id: CustomDesignId, generated: Parameters<typeof baselineFor>[1]) {
  const variant = useStudio((s) => variantById(s.variants, id));
  const build = useStudio((s) => s.builds[id]);
  const changes = useStudio((s) => s.changes[id]);
  const customDesigns = useResultsView((s) => s.customDesigns);
  const baseline = variant ? baselineFor(variant, generated, customDesigns) : null;

  const edit = useCallback(
    (update: (spec: DesignSpec) => DesignSpec, gesture?: string) =>
      useStudio.getState().edit(id, update, gesture),
    [id],
  );
  const end = useCallback(() => useStudio.getState().endGesture(id), [id]);

  return { variant, build, changes: changes ?? [], baseline, edit, end };
}
