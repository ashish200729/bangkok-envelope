import type { Check, CustomDesign, CustomDesignId, DesignSpec } from "@envelope/engine";
import { create } from "zustand";
import type { CustomDelivery } from "@/lib/engine/custom-builds";
import { type CheckChange, checkChanges } from "./checks";
import { EMPTY_SELECTION, type Selection } from "./floors";
import { applyEdit, endGesture, goTo, type History, redo, undo } from "./history";
import { makeVariant, type Variant } from "./variant";

export type BuildState =
  | { status: "building"; design: CustomDesign | null; breaches: number[] }
  | { status: "ready"; design: CustomDesign; breaches: number[]; ms: number }
  | {
      status: "error";
      code: string;
      message: string;
      /** The last good build, kept on screen dimmed. */
      design: CustomDesign | null;
      breaches: number[];
    };

type StudioState = {
  variants: Variant[];
  builds: Partial<Record<CustomDesignId, BuildState>>;
  /** Checks that flipped with each variant's last edit. */
  changes: Partial<Record<CustomDesignId, CheckChange[]>>;
  /** Floors selected in the editor, as levels of the selected variant. */
  selection: Selection;
};

type StudioActions = {
  replaceVariants: (variants: Variant[]) => void;
  addVariant: (variant: Variant) => void;
  duplicateVariant: (id: CustomDesignId) => Variant | null;
  deleteVariant: (id: CustomDesignId) => void;
  edit: (id: CustomDesignId, update: (spec: DesignSpec) => DesignSpec, gesture?: string) => void;
  endGesture: (id: CustomDesignId) => void;
  undo: (id: CustomDesignId) => void;
  redo: (id: CustomDesignId) => void;
  goTo: (id: CustomDesignId, steps: number) => void;
  /** Starts the variant again from `spec`, as one undoable step. */
  reset: (id: CustomDesignId, spec: DesignSpec) => void;
  setSelection: (selection: Selection) => void;
  receiveBuild: (delivery: CustomDelivery) => void;
};

/** Checklists of recent builds per variant, keyed by spec, for "What changed". */
const recent = new Map<CustomDesignId, Map<string, { input: unknown; checks: readonly Check[] }>>();
const RECENT_LIMIT = 24;

function remember(job: CustomDelivery["job"], checks: readonly Check[]) {
  let bySpec = recent.get(job.id);
  if (!bySpec) {
    bySpec = new Map();
    recent.set(job.id, bySpec);
  }
  const key = JSON.stringify(job.spec);
  bySpec.delete(key);
  bySpec.set(key, { input: job.input, checks });
  if (bySpec.size > RECENT_LIMIT) bySpec.delete(bySpec.keys().next().value as string);
}

function recalled(job: CustomDelivery["job"], spec: DesignSpec): readonly Check[] | null {
  const hit = recent.get(job.id)?.get(JSON.stringify(spec));
  return hit && hit.input === job.input ? hit.checks : null;
}

function withHistory(
  variants: readonly Variant[],
  id: CustomDesignId,
  change: (history: History) => History,
): Variant[] {
  let changed = false;
  const next = variants.map((v) => {
    if (v.id !== id) return v;
    const history = change(v.history);
    if (history === v.history) return v;
    changed = true;
    return { ...v, history };
  });
  return changed ? next : (variants as Variant[]);
}

export const useStudio = create<StudioState & StudioActions>()((set, get) => ({
  variants: [],
  builds: {},
  changes: {},
  selection: EMPTY_SELECTION,

  replaceVariants: (variants) =>
    set({ variants, builds: {}, changes: {}, selection: EMPTY_SELECTION }),
  addVariant: (variant) =>
    set((s) => ({
      variants: [...s.variants, variant],
      builds: { ...s.builds, [variant.id]: { status: "building", design: null, breaches: [] } },
      selection: EMPTY_SELECTION,
    })),
  duplicateVariant: (id) => {
    const s = get();
    const from = s.variants.find((v) => v.id === id);
    if (!from) return null;
    const copy = makeVariant(
      { id: from.id, name: from.history.present.name, badge: from.badge },
      from.history.present,
      s.variants.map((v) => v.badge),
      `${from.history.present.name} copy`.slice(0, 60),
    );
    get().addVariant({ ...copy, original: from.original });
    return copy;
  },
  deleteVariant: (id) =>
    set((s) => {
      const { [id]: _build, ...builds } = s.builds;
      const { [id]: _change, ...changes } = s.changes;
      return { variants: s.variants.filter((v) => v.id !== id), builds, changes };
    }),
  edit: (id, update, gesture) =>
    set((s) => ({
      variants: withHistory(s.variants, id, (h) => applyEdit(h, update(h.present), gesture)),
    })),
  endGesture: (id) => set((s) => ({ variants: withHistory(s.variants, id, endGesture) })),
  undo: (id) => set((s) => ({ variants: withHistory(s.variants, id, undo) })),
  redo: (id) => set((s) => ({ variants: withHistory(s.variants, id, redo) })),
  goTo: (id, steps) =>
    set((s) => ({ variants: withHistory(s.variants, id, (h) => goTo(h, steps)) })),
  reset: (id, spec) =>
    set((s) => ({
      variants: withHistory(s.variants, id, (h) =>
        applyEdit(endGesture(h), { ...spec, name: h.present.name }),
      ),
    })),
  setSelection: (selection) => set({ selection }),

  receiveBuild: ({ job, reply, latest }) =>
    set((s) => {
      if (!s.variants.some((v) => v.id === job.id)) return s;
      const previous = s.builds[job.id];
      const lastGood = previous?.design ?? null;
      if (reply.kind === "invalid") {
        return {
          builds: {
            ...s.builds,
            [job.id]: {
              status: "error",
              code: "invalid",
              message: `This edit cannot be built: ${reply.problems.join("; ")}`,
              design: lastGood,
              breaches: previous?.breaches ?? [],
            },
          },
        };
      }
      if (!reply.result.ok) {
        return {
          builds: {
            ...s.builds,
            [job.id]: {
              status: "error",
              code: reply.result.error.code,
              message: reply.result.error.message,
              design: lastGood,
              breaches: [],
            },
          },
        };
      }
      const design = reply.result.design;
      const build: BuildState = latest
        ? { status: "ready", design, breaches: reply.breaches, ms: reply.ms }
        : { status: "building", design, breaches: reply.breaches };
      remember(job, design.checks);
      if (!latest || !lastGood) return { builds: { ...s.builds, [job.id]: build } };
      // "What changed" compares with the state before the last undo step (a whole drag), not
      // with the build just before, which may be halfway through the same drag.
      const variant = s.variants.find((v) => v.id === job.id);
      const before = variant?.history.past.at(-1)?.spec;
      const base = (before && recalled(job, before)) ?? lastGood.checks;
      return {
        builds: { ...s.builds, [job.id]: build },
        changes: { ...s.changes, [job.id]: checkChanges(base, design.checks) },
      };
    }),
}));

/** Marks a variant as rebuilding, keeping its last design on screen. */
export function markBuilding(id: CustomDesignId) {
  useStudio.setState((s) => {
    const previous = s.builds[id];
    if (previous?.status === "building") return s;
    return {
      builds: {
        ...s.builds,
        [id]: {
          status: "building",
          design: previous?.design ?? null,
          breaches: previous?.breaches ?? [],
        },
      },
    };
  });
}

export const variantById = (variants: readonly Variant[], id: string | null) =>
  variants.find((v) => v.id === id) ?? null;
