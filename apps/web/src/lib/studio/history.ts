import { type DesignSpec, describeSpecChange } from "@envelope/engine";

/** One step: the spec on the far side of the change, and the change in words. */
export type HistoryEntry = { spec: DesignSpec; label: string };

/**
 * Undo history of one variant. `past` holds the specs before each change (newest last),
 * `future` the specs undone (next redo last). `gesture` is a drag still in progress: edits with
 * the same key fold into one step (at `past[depth]`), so a whole slider drag undoes at once.
 */
export type History = {
  past: HistoryEntry[];
  present: DesignSpec;
  future: HistoryEntry[];
  gesture: { key: string; depth: number } | null;
};

export const HISTORY_LIMIT = 100;

const sameSpec = (a: DesignSpec, b: DesignSpec) => JSON.stringify(a) === JSON.stringify(b);

export function createHistory(spec: DesignSpec): History {
  return { past: [], present: spec, future: [], gesture: null };
}

/**
 * Records `next` as the present. With a `gesture` key equal to the open gesture, the edit
 * replaces the last step instead of adding one (keeping the spec from before the drag), and a
 * drag that ends where it started leaves no step at all. A new edit clears redo.
 */
export function applyEdit(history: History, next: DesignSpec, gesture?: string): History {
  const open = gesture !== undefined && history.gesture?.key === gesture ? history.gesture : null;
  if (open) {
    // The drag's own step, if it has one yet, is the entry at `depth`.
    const base = history.past[open.depth];
    const past = history.past.slice(0, open.depth);
    const before = base?.spec ?? history.present;
    if (sameSpec(before, next)) return { past, present: next, future: [], gesture: open };
    return {
      past: [...past, { spec: before, label: describeSpecChange(before, next) }],
      present: next,
      future: [],
      gesture: open,
    };
  }
  const opened = gesture === undefined ? null : { key: gesture, depth: history.past.length };
  if (sameSpec(history.present, next)) return { ...history, gesture: opened };
  const entry = { spec: history.present, label: describeSpecChange(history.present, next) };
  const past = [...history.past, entry];
  const trimmed = past.length > HISTORY_LIMIT ? past.slice(-HISTORY_LIMIT) : past;
  return {
    past: trimmed,
    present: next,
    future: [],
    gesture: opened && { key: opened.key, depth: trimmed.length - 1 },
  };
}

/** Closes the open drag, so the next edit is a step of its own. */
export function endGesture(history: History): History {
  return history.gesture === null ? history : { ...history, gesture: null };
}

export const canUndo = (history: History) => history.past.length > 0;
export const canRedo = (history: History) => history.future.length > 0;

export function undo(history: History): History {
  const top = history.past[history.past.length - 1];
  if (!top) return history;
  return {
    past: history.past.slice(0, -1),
    present: top.spec,
    future: [...history.future, { spec: history.present, label: top.label }],
    gesture: null,
  };
}

export function redo(history: History): History {
  const next = history.future[history.future.length - 1];
  if (!next) return history;
  return {
    past: [...history.past, { spec: history.present, label: next.label }],
    present: next.spec,
    future: history.future.slice(0, -1),
    gesture: null,
  };
}

/** Undoes or redoes until `steps` changes are applied (the history list's "go back to here"). */
export function goTo(history: History, steps: number): History {
  let h = history;
  const target = Math.max(0, Math.min(steps, h.past.length + h.future.length));
  while (h.past.length > target) h = undo(h);
  while (h.past.length < target) h = redo(h);
  return h;
}
