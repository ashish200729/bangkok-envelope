import type { DesignId, EngineSuccess, Envelope } from "@envelope/engine";
import { create } from "zustand";

export type EnvelopeKind = "lowRise" | "highRise";
export type PanelTab = "plot" | "rules" | "designs";

type ResultsView = {
  /** Which envelope the user asked for; high-rise falls back to low-rise when not allowed. */
  envelopeKind: EnvelopeKind;
  selectedDesign: DesignId | null;
  tab: PanelTab;
};

type ResultsViewActions = {
  setEnvelopeKind: (kind: EnvelopeKind) => void;
  /** Selecting a design also shows the envelope it was fitted to. */
  selectDesign: (id: DesignId | null, envelope?: EnvelopeKind) => void;
  setTab: (tab: PanelTab) => void;
};

export const useResultsView = create<ResultsView & ResultsViewActions>()((set) => ({
  envelopeKind: "highRise",
  selectedDesign: null,
  tab: "plot",
  setEnvelopeKind: (envelopeKind) => set({ envelopeKind }),
  selectDesign: (selectedDesign, envelope) =>
    set(envelope ? { selectedDesign, envelopeKind: envelope } : { selectedDesign }),
  setTab: (tab) => set({ tab }),
}));

export type ShownEnvelope = { kind: EnvelopeKind; envelope: Envelope };

export function shownEnvelope(result: EngineSuccess, preferred: EnvelopeKind): ShownEnvelope {
  const { highRise, lowRise } = result.envelopes;
  if (preferred === "highRise" && highRise) return { kind: "highRise", envelope: highRise };
  return { kind: "lowRise", envelope: lowRise };
}
