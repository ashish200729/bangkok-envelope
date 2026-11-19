import { type FloorSpec, type FloorUse, MAX_FLOORS } from "@envelope/engine";

/** A run of identical consecutive floors (levels `start` to `end`, inclusive). */
export type FloorGroup = { start: number; end: number; spec: FloorSpec };

const sameFloor = (a: FloorSpec, b: FloorSpec) =>
  a.use === b.use && a.heightM === b.heightM && a.plate === b.plate && a.insetM === b.insetM;

export function groupFloors(floors: readonly FloorSpec[]): FloorGroup[] {
  const groups: FloorGroup[] = [];
  floors.forEach((spec, level) => {
    const last = groups[groups.length - 1];
    if (last && sameFloor(last.spec, spec)) last.end = level;
    else groups.push({ start: level, end: level, spec });
  });
  return groups;
}

/** Selected levels, sorted and unique, plus the level a Shift-click range grows from. */
export type Selection = { levels: readonly number[]; anchor: number | null };

export const EMPTY_SELECTION: Selection = { levels: [], anchor: null };

const sorted = (levels: Iterable<number>) => [...new Set(levels)].sort((a, b) => a - b);

export function range(from: number, to: number): number[] {
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

export type ClickModifiers = { shift?: boolean; toggle?: boolean };

/** Click selects one floor, Shift-click a range from the anchor, Cmd/Ctrl-click toggles one. */
export function clickSelect(
  selection: Selection,
  levels: readonly number[],
  modifiers: ClickModifiers = {},
): Selection {
  const first = levels[0];
  if (first === undefined) return selection;
  const last = levels[levels.length - 1] ?? first;
  if (modifiers.shift && selection.anchor !== null) {
    const far =
      Math.abs(first - selection.anchor) > Math.abs(last - selection.anchor) ? first : last;
    return { levels: range(selection.anchor, far), anchor: selection.anchor };
  }
  if (modifiers.toggle) {
    const all = levels.every((l) => selection.levels.includes(l));
    const next = all
      ? selection.levels.filter((l) => !levels.includes(l))
      : sorted([...selection.levels, ...levels]);
    return { levels: next, anchor: first };
  }
  return { levels: sorted(levels), anchor: first };
}

export function selectByUse(floors: readonly FloorSpec[], use: FloorUse): Selection {
  const levels = floors.flatMap((f, i) => (f.use === use ? [i] : []));
  return { levels, anchor: levels[0] ?? null };
}

/** Drops levels past the top after floors were removed. */
export function clampSelection(selection: Selection, floorCount: number): Selection {
  const levels = selection.levels.filter((l) => l < floorCount);
  const anchor =
    selection.anchor !== null && selection.anchor < floorCount ? selection.anchor : null;
  return { levels, anchor: anchor ?? levels[0] ?? null };
}

/** "Floors 8–12", "Floor 3", "Floors 2, 5 and 9" (floor 1 is the ground floor). */
export function describeLevels(levels: readonly number[]): string {
  const names = sorted(levels).map((l) => l + 1);
  const first = names[0];
  const last = names[names.length - 1];
  if (first === undefined || last === undefined) return "No floors";
  if (names.length === 1) return `Floor ${first}`;
  if (last - first === names.length - 1) return `Floors ${first}–${last}`;
  return `Floors ${names.slice(0, -1).join(", ")} and ${last}`;
}

/**
 * Levels from text such as "8-12", "8–12, 15" or "3" (floor numbers, 1 = ground). Null when the
 * text names no floor of this building.
 */
export function parseLevels(text: string, floorCount: number): number[] | null {
  const levels: number[] = [];
  for (const part of text.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = /^(\d+)\s*(?:[-–—]|to)\s*(\d+)$/.exec(trimmed) ?? /^(\d+)$/.exec(trimmed);
    if (!match) return null;
    const a = Number(match[1]);
    const b = Number(match[2] ?? match[1]);
    if (a < 1 || b < 1 || a > floorCount || b > floorCount) return null;
    levels.push(...range(a - 1, b - 1));
  }
  return levels.length > 0 ? sorted(levels) : null;
}

export type FloorEdit = { floors: FloorSpec[]; selection: Selection };

/** Changes the same fields on every selected floor: "Floors 8–12 → Office" in one step. */
export function setFloors(
  floors: readonly FloorSpec[],
  levels: readonly number[],
  patch: Partial<FloorSpec>,
): FloorSpec[] {
  const chosen = new Set(levels);
  return floors.map((f, i) => (chosen.has(i) ? { ...f, ...patch } : f));
}

const top = (levels: readonly number[]) => (levels.length ? Math.max(...levels) : null);

/** A new floor directly above the highest selected one (or on top), made by `make`. */
export function addAbove(
  floors: readonly FloorSpec[],
  levels: readonly number[],
  make: (below: FloorSpec | undefined) => FloorSpec,
): FloorEdit | null {
  if (floors.length >= MAX_FLOORS) return null;
  const at = (top(levels) ?? floors.length - 1) + 1;
  const next = [...floors.slice(0, at), make(floors[at - 1]), ...floors.slice(at)];
  return { floors: next, selection: { levels: [at], anchor: at } };
}

/** Copies the selected floors, in order, directly above the highest selected one. */
export function duplicate(
  floors: readonly FloorSpec[],
  levels: readonly number[],
): FloorEdit | null {
  const chosen = sorted(levels).filter((l) => l < floors.length);
  const high = top(chosen);
  if (high === null || floors.length + chosen.length > MAX_FLOORS) return null;
  const copies = chosen.map((l) => ({ ...(floors[l] as FloorSpec) }));
  const next = [...floors.slice(0, high + 1), ...copies, ...floors.slice(high + 1)];
  const added = range(high + 1, high + copies.length);
  return { floors: next, selection: { levels: added, anchor: added[0] ?? null } };
}

/** Removes the selected floors; a building keeps at least one. */
export function remove(floors: readonly FloorSpec[], levels: readonly number[]): FloorEdit | null {
  const chosen = new Set(levels);
  const next = floors.filter((_, i) => !chosen.has(i));
  if (next.length === floors.length || next.length === 0) return null;
  const low = Math.min(...chosen);
  const keep = Math.min(Math.max(0, low - 1), next.length - 1);
  return { floors: next, selection: { levels: [keep], anchor: keep } };
}

/**
 * Moves every selected floor one level up (+1) or down (-1), swapping with the unselected floor
 * it passes. A selected floor already at the end stays, and so do the selected floors behind it.
 */
export function move(
  floors: readonly FloorSpec[],
  levels: readonly number[],
  direction: 1 | -1,
): FloorEdit | null {
  const next = [...floors];
  const selected = new Set(levels.filter((l) => l >= 0 && l < floors.length));
  const order = [...selected].sort((a, b) => (direction === 1 ? b - a : a - b));
  // Where each selected floor ends up. The leading floors go first, so a target already in the
  // set is a selected floor that could not move.
  const moved = new Set<number>();
  let changed = false;
  for (const level of order) {
    const target = level + direction;
    if (target < 0 || target >= next.length || moved.has(target)) {
      moved.add(level);
      continue;
    }
    [next[level], next[target]] = [next[target] as FloorSpec, next[level] as FloorSpec];
    moved.add(target);
    changed = true;
  }
  if (!changed) return null;
  const levelsAfter = sorted(moved);
  return { floors: next, selection: { levels: levelsAfter, anchor: levelsAfter[0] ?? null } };
}
