"use client";

import { type Confidence, FEASIBILITY_ASSUMPTIONS, type FeasibilityKey } from "@envelope/engine";
import { Button } from "@envelope/ui/components/button";
import { Input } from "@envelope/ui/components/input";
import { cn } from "@envelope/ui/lib/utils";
import { ChevronRight, ExternalLink, RotateCcw } from "lucide-react";
import { useState } from "react";
import { formatNumber } from "@/lib/results/format";
import {
  ASSUMPTION_GROUPS,
  ASSUMPTION_LABEL,
  isFraction,
  sourceUrl,
  useFeasibility,
} from "@/lib/studio/feasibility";

const CONFIDENCE: Record<Confidence, { label: string; className: string }> = {
  stated: { label: "Stated", className: "bg-pass/12 text-pass" },
  derived: { label: "Derived", className: "bg-primary/10 text-primary" },
  estimate: { label: "Estimate", className: "bg-warn/15 text-warn" },
};

export function ConfidenceChip({ confidence }: { confidence: Confidence }) {
  const chip = CONFIDENCE[confidence];
  return (
    <span
      className={cn(
        "inline-flex h-4.5 items-center rounded px-1.5 font-medium text-[10px] uppercase tracking-wide",
        chip.className,
      )}
    >
      {chip.label}
    </span>
  );
}

/** What the field shows: percentages for ratios, whole baht otherwise. */
const shown = (key: FeasibilityKey, value: number) =>
  isFraction(key) ? String(Math.round(value * 10_000) / 100) : String(Math.round(value));

function unitText(key: FeasibilityKey): string {
  const unit = FEASIBILITY_ASSUMPTIONS[key].unit;
  return isFraction(key) ? `% (${unit})` : unit.replace(/^THB/, "฿");
}

function AssumptionRow({ assumptionKey: key }: { assumptionKey: FeasibilityKey }) {
  const value = useFeasibility((s) => s.values[key]);
  const edited = useFeasibility((s) => s.overrides[key] !== undefined);
  const [text, setText] = useState(shown(key, value));
  const [seen, setSeen] = useState(value);
  const [refused, setRefused] = useState(false);
  if (seen !== value) {
    setSeen(value);
    setText(shown(key, value));
    setRefused(false);
  }
  const a = FEASIBILITY_ASSUMPTIONS[key];
  const url = sourceUrl(a.source);
  const id = `assumption-${key}`;
  const def = a.value;

  return (
    <li className="grid gap-1.5 px-3 py-2.5" data-testid={id}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="font-medium text-sm">
          {ASSUMPTION_LABEL[key]}
        </label>
        <ConfidenceChip confidence={a.confidence} />
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step="any"
          className="h-8 w-32 font-mono tabular"
          value={text}
          aria-invalid={refused || undefined}
          aria-describedby={`${id}-note`}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() === "" || !Number.isFinite(n)) {
              setRefused(true);
              return;
            }
            const ok = useFeasibility.getState().set(key, isFraction(key) ? n / 100 : n);
            setRefused(!ok);
          }}
          onBlur={() => {
            setText(shown(key, value));
            setRefused(false);
          }}
        />
        <span className="min-w-0 truncate text-muted-foreground text-xs">{unitText(key)}</span>
        {edited && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            aria-label={`Reset ${ASSUMPTION_LABEL[key]} to ${shown(key, def)}`}
            title={`Reset to ${shown(key, def)}`}
            onClick={() => useFeasibility.getState().reset(key)}
          >
            <RotateCcw />
          </Button>
        )}
      </div>
      {refused && (
        <p className="text-fail text-xs">
          That value is out of range. Still using {shown(key, value)}
          {isFraction(key) ? "%" : ""}.
        </p>
      )}
      <p id={`${id}-note`} className="text-muted-foreground text-xs leading-snug">
        {a.note}{" "}
        {edited && (
          <span className="text-foreground">
            Default {isFraction(key) ? `${formatNumber(def * 100, 1)}%` : formatNumber(def, 0)}.{" "}
          </span>
        )}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={a.source}
            className="inline-flex items-center gap-0.5 underline decoration-border underline-offset-2 hover:text-foreground"
          >
            Source <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : (
          <span>Source: {a.source}</span>
        )}
      </p>
    </li>
  );
}

/** Every money assumption, grouped, editable, with its source and how sure it is. */
export function AssumptionsEditor() {
  const editedCount = useFeasibility((s) => Object.keys(s.overrides).length);
  return (
    <section aria-label="Assumptions" className="grid gap-2" data-testid="assumptions">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          Assumptions{" "}
          {editedCount > 0 && (
            <span className="normal-case tracking-normal text-primary">
              · {editedCount} changed
            </span>
          )}
        </h3>
        {editedCount > 0 && (
          <Button variant="ghost" size="xs" onClick={() => useFeasibility.getState().reset()}>
            <RotateCcw /> Reset all
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        Estimates are unsourced or weakly sourced: treat them as placeholders for your own numbers.
        Changes apply to every option and are kept in this browser.
      </p>
      <div className="grid gap-2">
        {ASSUMPTION_GROUPS.map((group) => (
          <details key={group.title} className="group rounded-lg border bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-medium text-sm [&::-webkit-details-marker]:hidden">
              <ChevronRight
                className="size-4 transition-transform group-open:rotate-90"
                aria-hidden
              />
              {group.title}
              <span className="ml-auto font-normal text-muted-foreground text-xs">
                {group.keys.length}
              </span>
            </summary>
            <ul className="grid divide-y border-t">
              {group.keys.map((key) => (
                <AssumptionRow key={key} assumptionKey={key} />
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
