"use client";

import type { CustomDesignId, DesignSpec } from "@envelope/engine";
import { Button } from "@envelope/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@envelope/ui/components/dropdown-menu";
import { Input } from "@envelope/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@envelope/ui/components/popover";
import { cn } from "@envelope/ui/lib/utils";
import {
  Copy,
  Download,
  History,
  MoreHorizontal,
  Printer,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import type { AnyDesign } from "@/lib/results/view";
import { deleteVariant, duplicateVariant } from "@/lib/studio/actions";
import { downloadText, floorScheduleCsv, scheduleFileName } from "@/lib/studio/csv";
import { canRedo, canUndo } from "@/lib/studio/history";
import { useStudio } from "@/lib/studio/store";
import type { Variant } from "@/lib/studio/variant";
import { SchemeBadge } from "../results/bits";

export function downloadSchedule(design: AnyDesign) {
  downloadText(
    `﻿${floorScheduleCsv(design)}`,
    scheduleFileName(design.name),
    "text/csv;charset=utf-8",
  );
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function HistoryList({ variant }: { variant: Variant }) {
  const { past, future } = variant.history;
  const steps = past.length;
  const entries = [
    ...future.map((e, i) => ({ label: e.label, step: steps + future.length - i, undone: true })),
    ...[...past].reverse().map((e, i) => ({ label: e.label, step: steps - i, undone: false })),
  ];
  return (
    <div className="grid gap-1" data-testid="history-list">
      <p className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
        History
      </p>
      {entries.length === 0 && (
        <p className="px-1 py-2 text-muted-foreground text-sm">No changes yet.</p>
      )}
      <ol className="grid max-h-72 overflow-y-auto">
        {entries.map((entry) => (
          <li key={entry.step}>
            <button
              type="button"
              onClick={() => useStudio.getState().goTo(variant.id, entry.step)}
              className={cn(
                "w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                entry.undone && "text-muted-foreground line-through decoration-muted-foreground/40",
                !entry.undone && entry.step === steps && "bg-accent",
              )}
            >
              {entry.label}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => useStudio.getState().goTo(variant.id, 0)}
            className={cn(
              "w-full rounded-md px-2 py-1.5 text-left text-muted-foreground text-sm hover:bg-muted",
              steps === 0 && "bg-accent",
            )}
          >
            Copied from {variant.source.badge} · {variant.source.name}
          </button>
        </li>
      </ol>
    </div>
  );
}

export function VariantHeader({
  variant,
  design,
  resetSpec,
  onPrint,
}: {
  variant: Variant;
  design: AnyDesign | null;
  resetSpec: DesignSpec;
  onPrint: () => void;
}) {
  const id: CustomDesignId = variant.id;
  const name = variant.history.present.name;
  const [draft, setDraft] = useState<string | null>(null);
  const mod = isMac() ? "⌘" : "Ctrl";

  const commitName = () => {
    const next = (draft ?? name).trim().slice(0, 60);
    setDraft(null);
    if (next && next !== name) useStudio.getState().edit(id, (s) => ({ ...s, name: next }));
  };

  return (
    <div className="flex items-center gap-2" data-testid="variant-header">
      <SchemeBadge badge={variant.badge} custom />
      <Input
        aria-label="Variant name"
        value={draft ?? name}
        maxLength={60}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1.5 font-semibold shadow-none hover:border-border focus-visible:border-ring"
      />
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Undo"
          title={`Undo (${mod} Z)`}
          disabled={!canUndo(variant.history)}
          onClick={() => useStudio.getState().undo(id)}
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Redo"
          title={`Redo (${mod} Shift Z)`}
          disabled={!canRedo(variant.history)}
          onClick={() => useStudio.getState().redo(id)}
        >
          <Redo2 />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="History" title="History">
              <History />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-2">
            <HistoryList variant={variant} />
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onSelect={() => duplicateVariant(id)}>
              <Copy /> Duplicate variant
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => useStudio.getState().reset(id, resetSpec)}>
              <RotateCcw /> Reset to {variant.source.badge}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!design}
              onSelect={() => design && downloadSchedule(design)}
            >
              <Download /> Download floor schedule (CSV)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onPrint}>
              <Printer /> Print summary
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => deleteVariant(id)}>
              <Trash2 /> Delete variant
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
