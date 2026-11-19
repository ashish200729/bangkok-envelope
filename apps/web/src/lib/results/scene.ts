import type { CustomDesign, EngineInput, EngineSuccess } from "@envelope/engine";
import { type EngineState, latestComputed } from "@/lib/engine/store";
import {
  type AnyDesign,
  type AnyDesignId,
  type EnvelopeKind,
  type ShownEnvelope,
  shownEnvelope,
} from "./view";

export type Scene = {
  result: EngineSuccess;
  input: EngineInput;
  envelope: ShownEnvelope;
  design: AnyDesign | null;
};

/** What the map and panels show for an engine state and view; null when there is no success. */
export function sceneFor(
  state: EngineState,
  view: {
    envelopeKind: EnvelopeKind;
    selectedDesign: AnyDesignId | null;
    customDesigns?: readonly CustomDesign[];
  },
): Scene | null {
  const computed = latestComputed(state);
  if (!computed?.result.ok) return null;
  const { result, input } = computed;
  const id = view.selectedDesign;
  const design: AnyDesign | null =
    result.designs.find((d) => d.id === id) ?? view.customDesigns?.find((d) => d.id === id) ?? null;
  return { result, input, envelope: shownEnvelope(result, view.envelopeKind), design };
}
