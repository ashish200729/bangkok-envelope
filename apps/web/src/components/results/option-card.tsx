"use client";

import { type EngineInput, formatTHB } from "@envelope/engine";
import { cn } from "@envelope/ui/lib/utils";
import { CircleAlert, LoaderCircle, Sparkles } from "lucide-react";
import { formatArea, formatInt, formatLength } from "@/lib/results/format";
import { useResultsView } from "@/lib/results/view";
import { feasibilityOf, useFeasibility } from "@/lib/studio/feasibility";
import { entryName, type OptionEntry } from "@/lib/studio/options";
import { StatusPill } from "./bits";

export function OptionBadge({
  badge,
  custom,
  className,
}: {
  badge: string;
  custom: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-7 min-w-7 shrink-0 place-items-center rounded-md px-1 font-mono font-semibold text-xs",
        custom
          ? "border border-primary/50 border-dashed text-primary"
          : "bg-foreground text-background",
        className,
      )}
    >
      {badge}
    </span>
  );
}

function KeyFigure({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone?: "fail" | "pass";
  testId?: string;
}) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
      <dd
        data-testid={testId}
        className={cn(
          "truncate font-medium text-[13px] tabular-nums",
          tone === "fail" && "text-fail",
          tone === "pass" && "text-pass",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function OptionCard({
  entry,
  input,
  selected,
  recommended,
}: {
  entry: OptionEntry;
  input: EngineInput;
  selected: boolean;
  recommended: boolean;
}) {
  const values = useFeasibility((s) => s.values);
  const { design } = entry;
  const money = design ? feasibilityOf(design, input, values) : null;
  const build = entry.kind === "variant" ? entry.build : undefined;
  const building = build?.status === "building";
  const error = build?.status === "error" ? build : null;
  const name = entryName(entry);

  return (
    <button
      type="button"
      aria-pressed={selected}
      data-testid={`option-${entry.id}`}
      data-badge={entry.badge}
      onClick={() => {
        if (design) useResultsView.getState().selectDesign(entry.id, design.envelope);
        else useResultsView.getState().selectDesign(entry.id);
      }}
      className={cn(
        "group grid w-full gap-2.5 rounded-xl border bg-card p-3.5 text-left transition-[border-color,box-shadow] hover:border-foreground/25 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
        selected && "border-primary shadow-[0_0_0_1px_var(--primary)] hover:border-primary",
      )}
    >
      <div className="flex items-start gap-2.5">
        <OptionBadge badge={entry.badge} custom={entry.kind === "variant"} />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate font-semibold text-sm">{name}</h3>
            {recommended && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-[11px] text-primary">
                <Sparkles className="size-3" aria-hidden />
                Recommended
              </span>
            )}
          </div>
          <p className="line-clamp-2 text-muted-foreground text-xs leading-snug">
            {entry.kind === "variant"
              ? `Your version of ${entry.variant.source.badge}. ${design?.summary ?? ""}`
              : design?.summary}
          </p>
        </div>
        <span className="shrink-0">
          {building && !design ? (
            <LoaderCircle
              className="size-4 animate-spin text-muted-foreground"
              aria-label="Building"
            />
          ) : design ? (
            <StatusPill status={design.passes ? "pass" : "fail"} />
          ) : null}
        </span>
      </div>

      {design && money ? (
        <dl className={cn("grid grid-cols-4 gap-2 transition-opacity", building && "opacity-60")}>
          <KeyFigure label="Floor area" value={formatArea(design.gfaM2)} testId="card-gfa" />
          <KeyFigure
            label="Height · storeys"
            value={`${formatLength(design.heightM)} · ${formatInt(design.floors.length)}`}
          />
          <KeyFigure label="Rough cost" value={formatTHB(money.costs.totalTHB)} />
          <KeyFigure
            label="Left for land"
            value={formatTHB(money.leftForLandTHB)}
            tone={money.landVerdict === "covers land" ? "pass" : "fail"}
          />
        </dl>
      ) : null}

      {error && (
        <p className="flex items-start gap-1.5 text-fail text-xs" role="status">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {error.message}
        </p>
      )}
    </button>
  );
}
