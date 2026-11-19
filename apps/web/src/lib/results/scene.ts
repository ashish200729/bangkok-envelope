import type { Design, EngineInput, EngineSuccess } from "@envelope/engine";
import { type EngineState, latestComputed } from "@/lib/engine/store";
import { type EnvelopeKind, type ShownEnvelope, shownEnvelope } from "./view";

export type Scene = {
  result: EngineSuccess;
  input: EngineInput;
  envelope: ShownEnvelope;
  design: Design | null;
};

/** What the map and panels show for an engine state and view; null when there is no success. */
export function sceneFor(
  state: EngineState,
  view: { envelopeKind: EnvelopeKind; selectedDesign: Design["id"] | null },
): Scene | null {
  const computed = latestComputed(state);
  if (!computed?.result.ok) return null;
  const { result, input } = computed;
  const design = result.designs.find((d) => d.id === view.selectedDesign) ?? null;
  return { result, input, envelope: shownEnvelope(result, view.envelopeKind), design };
}
