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

/** The inspector's sections, in order. */
export const SECTIONS = ["plot", "rules", "schemes", "money"] as const;
export type Section = (typeof SECTIONS)[number];

type ResultsView = {
  /** Which envelope the user asked for; high-rise falls back to low-rise when not allowed. */
  envelopeKind: EnvelopeKind;
  selectedDesign: AnyDesignId | null;
  /** The floor (its `level`) picked on the map or in a panel; cleared with the design. */
  selectedFloor: number | null;
  section: Section;
  /** The selected scheme's editor is open in the Schemes section. */
  editing: boolean;
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
  setSection: (section: Section) => void;
  /** Opens the Schemes section with the selected scheme's editor open or closed. */
  setEditing: (editing: boolean) => void;
  setCustomDesigns: (designs: readonly CustomDesign[]) => void;
};

export const useResultsView = create<ResultsView & ResultsViewActions>()((set) => ({
  envelopeKind: "highRise",
  selectedDesign: null,
  selectedFloor: null,
  section: "schemes",
  editing: false,
  customDesigns: [],
  setEnvelopeKind: (envelopeKind) => set({ envelopeKind }),
  selectDesign: (selectedDesign, envelope) =>
    set((s) => {
      const editing = s.editing && selectedDesign?.startsWith("custom-") === true;
      return envelope
        ? { selectedDesign, selectedFloor: null, envelopeKind: envelope, editing }
        : { selectedDesign, selectedFloor: null, editing };
    }),
  setSelectedFloor: (selectedFloor) => set({ selectedFloor }),
  setSection: (section) => set({ section }),
  setEditing: (editing) => set({ section: "schemes", editing }),
  setCustomDesigns: (customDesigns) => set({ customDesigns }),
}));

export type ShownEnvelope = { kind: EnvelopeKind; envelope: Envelope };

export function shownEnvelope(result: EngineSuccess, preferred: EnvelopeKind): ShownEnvelope {
  const { highRise, lowRise } = result.envelopes;
  if (preferred === "highRise" && highRise) return { kind: "highRise", envelope: highRise };
  return { kind: "lowRise", envelope: lowRise };
}
