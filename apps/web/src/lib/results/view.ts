import type {
  CustomDesign,
  CustomDesignId,
  Design,
  DesignId,
  EngineSuccess,
  Envelope,
} from "@envelope/engine";
import { create } from "zustand";

export type EnvelopeKind = "lowRise" | "highRise";
export type AnyDesignId = DesignId | CustomDesignId;
/** A generated option (A, B, C) or one of the user's edited variants. */
export type AnyDesign = Design<AnyDesignId>;

/** The three steps across the top. A navigation aid: every step stays reachable. */
export type Step = "brief" | "site" | "options";
export type SiteTab = "plot" | "rules";
export type OptionTab = "shape" | "rules" | "customise" | "cost" | "return";

type ResultsView = {
  /** Which envelope the user asked for; high-rise falls back to low-rise when not allowed. */
  envelopeKind: EnvelopeKind;
  selectedDesign: AnyDesignId | null;
  /** The floor (its `level`) picked on the map or in a panel; cleared with the design. */
  selectedFloor: number | null;
  step: Step;
  siteTab: SiteTab;
  optionTab: OptionTab;
  /**
   * The latest build of every studio variant, in the order they were made. Mirrored here by the
   * studio so the map, which already follows this store, draws a selected variant.
   */
  customDesigns: readonly CustomDesign[];
};

type ResultsViewActions = {
  setEnvelopeKind: (kind: EnvelopeKind) => void;
  /** Selecting a design also shows the envelope it was fitted to, and clears the floor. */
  selectDesign: (id: AnyDesignId | null, envelope?: EnvelopeKind) => void;
  setSelectedFloor: (level: number | null) => void;
  setStep: (step: Step) => void;
  setSiteTab: (tab: SiteTab) => void;
  setOptionTab: (tab: OptionTab) => void;
  /** Opens the Site and rules step on one of its tabs. */
  goToSite: (tab: SiteTab) => void;
  setCustomDesigns: (designs: readonly CustomDesign[]) => void;
};

export const useResultsView = create<ResultsView & ResultsViewActions>()((set) => ({
  envelopeKind: "highRise",
  selectedDesign: null,
  selectedFloor: null,
  step: "options",
  siteTab: "plot",
  optionTab: "shape",
  customDesigns: [],
  setEnvelopeKind: (envelopeKind) => set({ envelopeKind }),
  selectDesign: (selectedDesign, envelope) =>
    set(
      envelope
        ? { selectedDesign, selectedFloor: null, envelopeKind: envelope }
        : { selectedDesign, selectedFloor: null },
    ),
  setSelectedFloor: (selectedFloor) => set({ selectedFloor }),
  setStep: (step) => set({ step }),
  setSiteTab: (siteTab) => set({ siteTab }),
  setOptionTab: (optionTab) => set({ optionTab }),
  goToSite: (siteTab) => set({ step: "site", siteTab }),
  setCustomDesigns: (customDesigns) => set({ customDesigns }),
}));

export type ShownEnvelope = { kind: EnvelopeKind; envelope: Envelope };

export function shownEnvelope(result: EngineSuccess, preferred: EnvelopeKind): ShownEnvelope {
  const { highRise, lowRise } = result.envelopes;
  if (preferred === "highRise" && highRise) return { kind: "highRise", envelope: highRise };
  return { kind: "lowRise", envelope: lowRise };
}
