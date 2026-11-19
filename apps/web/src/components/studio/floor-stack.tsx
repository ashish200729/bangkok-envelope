"use client";

import {
  type DesignSpec,
  defaultFloorSpec,
  defaultTowerSpec,
  type EngineInput,
  type Envelope,
  FLOOR_USES,
  type FloorSpec,
  type FloorUse,
  MAX_FLOORS,
  MAX_INSET_M,
  USE_LABEL,
} from "@envelope/engine";
import { Button } from "@envelope/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@envelope/ui/components/dropdown-menu";
import { Input } from "@envelope/ui/components/input";
import { Label } from "@envelope/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@envelope/ui/components/select";
import { ToggleGroup, ToggleGroupItem } from "@envelope/ui/components/toggle-group";
import { cn } from "@envelope/ui/lib/utils";
import { ArrowDown, ArrowUp, ChevronRight, CircleAlert, Copy, Plus, Trash2 } from "lucide-react";
import { type KeyboardEvent, useMemo, useState } from "react";
import { floorUseColor } from "@/lib/results/designs";
import { formatArea, formatLength } from "@/lib/results/format";
import type { AnyDesign } from "@/lib/results/view";
import {
  addAbove,
  type ClickModifiers,
  clickSelect,
  describeLevels,
  duplicate,
  type FloorEdit,
  groupFloors,
  move,
  parseLevels,
  range,
  remove,
  selectByUse,
  setFloors,
} from "@/lib/studio/floors";
import { useStudio } from "@/lib/studio/store";
import { SectionPreview } from "../results/section-preview";
import { SliderField } from "./slider-field";

type Row =
  | { kind: "group"; start: number; end: number; spec: FloorSpec }
  | { kind: "floor"; level: number; spec: FloorSpec; inGroup: boolean };

const levelsOf = (row: Row) => (row.kind === "group" ? range(row.start, row.end) : [row.level]);
const rowKey = (row: Row) => (row.kind === "group" ? `g${row.start}-${row.end}` : `f${row.level}`);

/** Floors top-down, runs of identical floors folded into one row unless expanded or split by the selection. */
function visibleRows(
  floors: readonly FloorSpec[],
  expanded: ReadonlySet<number>,
  selected: ReadonlySet<number>,
): Row[] {
  const rows: Row[] = [];
  for (const group of groupFloors(floors).reverse()) {
    const levels = range(group.start, group.end);
    const partly = levels.some((l) => selected.has(l)) && !levels.every((l) => selected.has(l));
    if (group.end > group.start && !expanded.has(group.start) && !partly) {
      rows.push({ kind: "group", ...group });
      continue;
    }
    for (const level of levels.reverse()) {
      rows.push({
        kind: "floor",
        level,
        spec: floors[level] as FloorSpec,
        inGroup: group.end > group.start,
      });
    }
  }
  return rows;
}

const same = <T,>(values: readonly T[]): T | null =>
  values.length > 0 && values.every((v) => v === values[0]) ? (values[0] as T) : null;

export function FloorStack({
  variantId,
  spec,
  design,
  input,
  envelope,
  breaches,
  edit,
  end,
  floorsFail,
}: {
  variantId: string;
  spec: DesignSpec;
  design: AnyDesign | null;
  input: EngineInput;
  envelope: Envelope | null;
  breaches: readonly number[];
  edit: (update: (spec: DesignSpec) => DesignSpec, gesture?: string) => void;
  end: () => void;
  floorsFail: boolean;
}) {
  const selection = useStudio((s) => s.selection);
  const setSelection = useStudio((s) => s.setSelection);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const [rangeText, setRangeText] = useState("");
  const [rangeError, setRangeError] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const selected = useMemo(() => new Set(selection.levels), [selection.levels]);
  const bad = useMemo(() => {
    const out = new Set(breaches);
    design?.floors.forEach((f) => {
      if (f.areaM2 === 0) out.add(f.level);
    });
    return out;
  }, [breaches, design]);
  const rows = useMemo(
    () => visibleRows(spec.floors, expanded, selected),
    [spec.floors, expanded, selected],
  );
  const levels = selection.levels.filter((l) => l < spec.floors.length);
  const chosen = levels.map((l) => spec.floors[l] as FloorSpec);
  const areaOf = (level: number) =>
    design && design.floors.length === spec.floors.length
      ? (design.floors[level]?.areaM2 ?? 0)
      : null;

  const select = (next: number[], modifiers: ClickModifiers = {}) =>
    setSelection(clickSelect(selection, next, modifiers));

  const applyEdit = (result: FloorEdit | null) => {
    if (!result) return;
    edit((s) => ({ ...s, floors: result.floors }));
    setSelection(result.selection);
  };

  const patch = (change: Partial<FloorSpec>, gesture?: string) => {
    if (levels.length === 0) return;
    edit((s) => {
      const tower = change.plate === "tower" && !s.tower ? defaultTowerSpec(input) : s.tower;
      if (change.plate === "tower" && !tower) return s;
      return { ...s, tower, floors: setFloors(s.floors, levels, change) };
    }, gesture);
  };

  const moveFocus = (index: number, extend: boolean) => {
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (!row) return;
    setFocusKey(rowKey(row));
    if (extend) select(levelsOf(row), { shift: true });
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-row-key="${rowKey(row)}"][data-variant="${variantId}"]`)
        ?.focus(),
    );
  };

  const onRowKey = (e: KeyboardEvent, row: Row, index: number) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (e.altKey) {
        applyEdit(move(spec.floors, levels, e.key === "ArrowUp" ? 1 : -1));
        return;
      }
      moveFocus(index + (e.key === "ArrowDown" ? 1 : -1), e.shiftKey);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      select(levelsOf(row), { shift: e.shiftKey, toggle: e.metaKey || e.ctrlKey });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      applyEdit(remove(spec.floors, levels));
    } else if (e.key === "Escape") {
      setSelection({ levels: [], anchor: null });
    } else if (e.key === "ArrowRight" && row.kind === "group") {
      setExpanded(new Set([...expanded, row.start]));
    }
  };

  const useValue = same(chosen.map((f) => f.use));
  const heightValue = same(chosen.map((f) => f.heightM));
  const plateValue = same(chosen.map((f) => f.plate));
  const insetValue = same(chosen.map((f) => f.insetM));
  const usesPresent = FLOOR_USES.filter((u) => spec.floors.some((f) => f.use === u));

  return (
    <div className="grid gap-3" data-testid="floor-stack">
      {design && (
        <SectionPreview
          design={design}
          input={input}
          envelope={envelope}
          selected={levels}
          breaches={[...bad]}
          height={230}
          onSelect={(next, modifiers) => select(next, modifiers)}
        />
      )}

      <div className="flex flex-wrap items-end gap-2">
        <form
          className="grid min-w-0 flex-1 gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = parseLevels(rangeText, spec.floors.length);
            setRangeError(parsed === null);
            if (parsed) setSelection({ levels: parsed, anchor: parsed[0] ?? null });
          }}
        >
          <Label htmlFor={`${variantId}-range`} className="text-muted-foreground text-xs">
            Select floors by number
          </Label>
          <div className="flex gap-1.5">
            <Input
              id={`${variantId}-range`}
              value={rangeText}
              placeholder={`e.g. 8-12 (1–${spec.floors.length})`}
              aria-invalid={rangeError || undefined}
              className="h-8 font-mono text-sm"
              onChange={(e) => {
                setRangeText(e.target.value);
                setRangeError(false);
              }}
            />
            <Button type="submit" variant="outline" size="sm" className="h-8">
              Select
            </Button>
          </div>
        </form>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              By use
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {usesPresent.map((use) => (
              <DropdownMenuItem
                key={use}
                onSelect={() => setSelection(selectByUse(spec.floors, use))}
              >
                <span
                  aria-hidden
                  className="size-2.5 rounded-sm"
                  style={{ background: floorUseColor(use) }}
                />
                All {USE_LABEL[use].toLowerCase()} floors
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              onSelect={() => setSelection({ levels: range(0, spec.floors.length - 1), anchor: 0 })}
            >
              Every floor
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {rangeError && (
        <p className="-mt-1.5 text-fail text-xs">
          Type floor numbers from 1 to {spec.floors.length}, like 8-12 or 3, 5.
        </p>
      )}

      {levels.length > 0 && (
        <section
          aria-label="Selected floors"
          data-testid="floor-inspector"
          className="grid gap-3 rounded-xl border border-primary/30 bg-primary/[0.03] p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-sm" data-testid="selection-label">
              {describeLevels(levels)}
              <span className="ml-1.5 font-normal text-muted-foreground text-xs">
                {levels.length} selected
              </span>
            </p>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSelection({ levels: [], anchor: null })}
            >
              Clear
            </Button>
          </div>
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2.5">
            <Label htmlFor={`${variantId}-use`} className="text-sm">
              Use
            </Label>
            <Select
              value={useValue ?? ""}
              onValueChange={(v) => {
                patch({ use: v as FloorUse });
                end();
              }}
            >
              <SelectTrigger
                id={`${variantId}-use`}
                className="h-8 w-full"
                aria-label="Use of the selected floors"
              >
                <SelectValue placeholder="Mixed uses" />
              </SelectTrigger>
              <SelectContent>
                {FLOOR_USES.map((use) => (
                  <SelectItem key={use} value={use}>
                    <span
                      aria-hidden
                      className="size-2.5 rounded-sm"
                      style={{ background: floorUseColor(use) }}
                    />
                    {USE_LABEL[use]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm">Plate</span>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={plateValue ?? ""}
              aria-label="Plate of the selected floors"
              onValueChange={(v) => {
                if (v) {
                  patch({ plate: v as FloorSpec["plate"] });
                  end();
                }
              }}
            >
              <ToggleGroupItem value="envelope" className="px-3">
                Fill envelope
              </ToggleGroupItem>
              <ToggleGroupItem value="tower" className="px-3">
                Tower
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <SliderField
            id={`${variantId}-height`}
            label="Floor to floor"
            value={heightValue}
            min={2.6}
            max={8}
            step={0.1}
            unit="m"
            onChange={(v, g) => patch({ heightM: v }, g)}
            onEnd={end}
          />
          <SliderField
            id={`${variantId}-inset`}
            label="Inset from the envelope"
            value={insetValue}
            min={0}
            max={MAX_INSET_M}
            step={0.5}
            unit="m"
            onChange={(v, g) => patch({ insetM: v }, g)}
            onEnd={end}
          />
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={spec.floors.length >= MAX_FLOORS}
              onClick={() =>
                applyEdit(
                  addAbove(spec.floors, levels, (below) =>
                    defaultFloorSpec(below?.use ?? "residential", below),
                  ),
                )
              }
            >
              <Plus /> Add floor above
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={spec.floors.length + levels.length > MAX_FLOORS}
              onClick={() => applyEdit(duplicate(spec.floors, levels))}
            >
              <Copy /> Duplicate
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Move the selected floors up"
              title="Move up (Alt + ↑)"
              onClick={() => applyEdit(move(spec.floors, levels, 1))}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Move the selected floors down"
              title="Move down (Alt + ↓)"
              onClick={() => applyEdit(move(spec.floors, levels, -1))}
            >
              <ArrowDown />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto text-fail hover:text-fail"
              disabled={levels.length >= spec.floors.length}
              onClick={() => applyEdit(remove(spec.floors, levels))}
            >
              <Trash2 /> Remove
            </Button>
          </div>
        </section>
      )}

      <div
        role="listbox"
        aria-multiselectable="true"
        aria-label="Floors, top floor first"
        data-testid="floor-list"
        className={cn(
          "grid overflow-hidden rounded-xl border bg-card",
          floorsFail && "border-fail/50",
        )}
      >
        {rows.map((row, index) => {
          const rowLevels = levelsOf(row);
          const isSelected = rowLevels.every((l) => selected.has(l));
          const isBad = rowLevels.some((l) => bad.has(l));
          const key = rowKey(row);
          const focusable = focusKey === null ? index === 0 : focusKey === key;
          const area = rowLevels.reduce<number | null>((sum, l) => {
            const a = areaOf(l);
            return sum === null || a === null ? null : sum + a;
          }, 0);
          const count = rowLevels.length;
          return (
            <div
              key={key}
              role="option"
              aria-selected={isSelected}
              tabIndex={focusable ? 0 : -1}
              data-row-key={key}
              data-variant={variantId}
              data-testid={row.kind === "group" ? "floor-group-row" : "floor-row"}
              data-levels={rowLevels.join(",")}
              data-breach={isBad || undefined}
              onFocus={() => setFocusKey(key)}
              onClick={(e) =>
                select(rowLevels, { shift: e.shiftKey, toggle: e.metaKey || e.ctrlKey })
              }
              onKeyDown={(e) => onRowKey(e, row, index)}
              className={cn(
                "flex h-9 min-w-0 cursor-pointer items-center gap-1.5 border-b px-2.5 text-sm outline-none last:border-b-0 hover:bg-muted/60 focus-visible:bg-muted focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]",
                isSelected && "bg-accent hover:bg-accent",
                isBad && "shadow-[inset_3px_0_0_var(--fail)]",
                row.kind === "floor" && row.inGroup && "pl-6",
              )}
            >
              {row.kind === "group" ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Show ${count} floors one by one`}
                  className="-ml-1 grid size-5 place-items-center rounded text-muted-foreground hover:bg-background"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(new Set([...expanded, row.start]));
                  }}
                >
                  <ChevronRight className="size-3.5" />
                </button>
              ) : null}
              <span
                aria-hidden
                className="h-4 w-1.5 shrink-0 rounded-sm"
                style={{ background: floorUseColor(row.spec.use) }}
              />
              <span className="w-[4.25rem] shrink-0 whitespace-nowrap font-mono text-xs tabular">
                {row.kind === "group" ? `${row.start + 1}–${row.end + 1}` : `${row.level + 1}`}
                {row.kind === "group" && <span className="text-muted-foreground"> ×{count}</span>}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {USE_LABEL[row.spec.use]}
                {row.spec.plate === "tower" && (
                  <span className="ml-1.5 rounded bg-muted px-1 py-px text-[10.5px] text-muted-foreground">
                    Tower
                  </span>
                )}
                {row.spec.insetM > 0 && (
                  <span className="ml-1.5 text-[10.5px] text-muted-foreground">
                    inset {formatLength(row.spec.insetM)}
                  </span>
                )}
              </span>
              {isBad && (
                <CircleAlert
                  className="size-3.5 shrink-0 text-fail"
                  aria-label="Outside the envelope or empty"
                />
              )}
              <span className="w-11 shrink-0 whitespace-nowrap text-right font-mono text-muted-foreground text-xs tabular">
                {formatLength(row.spec.heightM)}
              </span>
              <span className="w-[4.75rem] shrink-0 whitespace-nowrap text-right font-mono text-xs tabular">
                {area === null ? "…" : formatArea(area)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Click a floor, Shift-click for a range, {"⌘"}/Ctrl-click to add one. Arrow keys move, Space
        selects, Alt + arrows move floors, Delete removes.
      </p>
    </div>
  );
}
