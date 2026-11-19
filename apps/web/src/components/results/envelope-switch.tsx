"use client";

import type { EngineSuccess } from "@envelope/engine";
import { cn } from "@envelope/ui/lib/utils";
import { type EnvelopeKind, shownEnvelope, useResultsView } from "@/lib/results/view";

const OPTIONS: { kind: EnvelopeKind; label: string }[] = [
  { kind: "lowRise", label: "Low-rise (under 23 m)" },
  { kind: "highRise", label: "High-rise" },
];

function highRiseBlockedReason(result: EngineSuccess): string {
  const failed = result.highRise.checks.find((check) => check.status === "fail");
  return failed?.message ?? "This plot cannot hold a high-rise.";
}

/** Chooses which envelope the map shows; high-rise is disabled, with the reason, when not allowed. */
export function EnvelopeSwitch({ result }: { result: EngineSuccess }) {
  const preferred = useResultsView((s) => s.envelopeKind);
  const shown = shownEnvelope(result, preferred).kind;
  const highRiseAllowed = result.envelopes.highRise !== null;

  return (
    <div className="grid gap-2">
      <div
        role="radiogroup"
        aria-label="Envelope shown on the map"
        className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
      >
        {OPTIONS.map(({ kind, label }) => {
          const disabled = kind === "highRise" && !highRiseAllowed;
          const active = shown === kind;
          return (
            // biome-ignore lint/a11y/useSemanticElements: a segmented control styled as buttons
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => useResultsView.getState().setEnvelopeKind(kind)}
              className={cn(
                "h-8 rounded-md px-2 font-medium text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                active
                  ? "bg-background text-foreground shadow-sm dark:bg-input/40"
                  : "text-muted-foreground hover:text-foreground",
                disabled && "cursor-not-allowed opacity-50 hover:text-muted-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {!highRiseAllowed && (
        <p className="text-muted-foreground text-xs" data-testid="high-rise-blocked">
          High-rise not allowed: {highRiseBlockedReason(result)}
        </p>
      )}
    </div>
  );
}
