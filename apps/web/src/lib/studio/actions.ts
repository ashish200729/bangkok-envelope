import type { CustomDesignId, DesignId } from "@envelope/engine";
import { type AnyDesign, useResultsView } from "@/lib/results/view";
import { useStudio, variantById } from "./store";
import { GENERATED_BADGE, makeVariant } from "./variant";

function show(id: CustomDesignId, envelope: AnyDesign["envelope"]) {
  const view = useResultsView.getState();
  view.selectDesign(id, envelope);
  view.setOptionTab("customise");
  view.setStep("options");
}

/** "Customise": an editable copy of any option, seeded with its spec, selected and opened. */
export function customise(design: AnyDesign): CustomDesignId {
  const studio = useStudio.getState();
  const fromVariant = variantById(studio.variants, design.id);
  const badge = fromVariant?.badge ?? GENERATED_BADGE[design.id as DesignId] ?? "X";
  const variant = makeVariant(
    { id: design.id, name: design.name, badge },
    design.spec,
    studio.variants.map((v) => v.badge),
    fromVariant ? `${design.name} copy` : undefined,
  );
  studio.addVariant(variant);
  show(variant.id, design.spec.envelope);
  return variant.id;
}

export function duplicateVariant(id: CustomDesignId) {
  const copy = useStudio.getState().duplicateVariant(id);
  if (copy) show(copy.id, copy.history.present.envelope);
}

/** Deletes a variant and shows the option it came from. */
export function deleteVariant(id: CustomDesignId) {
  const studio = useStudio.getState();
  const variant = variantById(studio.variants, id);
  studio.deleteVariant(id);
  const view = useResultsView.getState();
  if (view.selectedDesign === id) view.selectDesign(variant?.source.id ?? null);
}
