"use client";

import { Button } from "@envelope/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@envelope/ui/components/collapsible";
import { cn } from "@envelope/ui/lib/utils";
import {
  ArrowLeft,
  ChevronDown,
  CircleAlert,
  Download,
  LoaderCircle,
  PencilRuler,
  Printer,
  Rows3,
} from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { formatArea, formatInt, formatLength } from "@/lib/results/format";
import type { Scene } from "@/lib/results/scene";
import { type AnyDesign, useResultsView } from "@/lib/results/view";
import { customise } from "@/lib/studio/actions";
import { entryName, type OptionEntry } from "@/lib/studio/options";
import { useStudio, variantById } from "@/lib/studio/store";
import { useOptions } from "@/lib/studio/use-options";
import { StudioEditor } from "../studio/editor";
import { downloadSchedule } from "../studio/variant-header";
import { SchemeBadge } from "./bits";
import { Checklist, countsText } from "./checklist";
import { EngineGuidance } from "./engine-guidance";
import { FloorSchedule } from "./floor-schedule";
import { SectionPreview } from "./section-preview";

export function printSummary() {
  window.print();
}

const NO_LEVELS: readonly number[] = [];

function SchemeRow({ entry, selected }: { entry: OptionEntry; selected: boolean }) {
  const { design } = entry;
  const build = entry.kind === "variant" ? entry.build : undefined;
  const building = build?.status === "building";
  const failed = build?.status === "error";
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-testid={`option-${entry.id}`}
      data-badge={entry.badge}
      onClick={() => useResultsView.getState().selectDesign(entry.id, design?.envelope)}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring",
        selected && "bg-muted hover:bg-muted",
      )}
    >
      <SchemeBadge badge={entry.badge} custom={entry.kind === "variant"} />
      <span className="grid min-w-0 flex-1">
        <span className="truncate font-medium text-sm">{entryName(entry)}</span>
        <span
          className={cn(
            "truncate font-mono text-[11px] text-muted-foreground tabular",
            building && "opacity-60",
          )}
          data-testid="card-gfa"
        >
          {design
            ? `${formatArea(design.gfaM2)} · ${formatLength(design.heightM)} · ${formatInt(design.floors.length)} fl`
            : failed
              ? "Nothing to build"
              : "Building…"}
        </span>
      </span>
      {building && !design ? (
        <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Building" />
      ) : failed && !design ? (
        <CircleAlert className="size-4 text-fail" aria-label="Cannot be built" />
      ) : design ? (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs",
            design.passes ? "text-pass" : "text-fail",
          )}
        >
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", design.passes ? "bg-pass" : "bg-fail")}
          />
          {design.passes ? "Pass" : "Fail"}
        </span>
      ) : null}
    </button>
  );
}

function Fold({
  title,
  aside,
  children,
  defaultOpen = false,
  testId,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  testId?: string;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="border-t" data-testid={testId}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 py-3 text-left focus-visible:outline-2 focus-visible:outline-ring">
        <span className="font-medium text-sm">{title}</span>
        {aside && <span className="text-muted-foreground text-xs">{aside}</span>}
        <ChevronDown
          aria-hidden
          className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function SchemeOverview({ scene, design }: { scene: Scene; design: AnyDesign }) {
  const selectedFloor = useResultsView((s) => s.selectedFloor);
  const build = useStudio((s) => s.builds[design.id as `custom-${string}`]);
  const breaches = build?.breaches ?? NO_LEVELS;
  const isVariant = design.id.startsWith("custom-");
  const envelope =
    design.envelope === "highRise"
      ? (scene.result.envelopes.highRise ?? scene.result.envelopes.lowRise)
      : scene.result.envelopes.lowRise;

  return (
    <div className="grid" data-testid="shape-tab">
      <p className="pb-3 text-muted-foreground text-sm leading-relaxed">{design.summary}</p>
      <dl className="grid grid-cols-3 gap-3 pb-4">
        {[
          ["Floor area", formatArea(design.gfaM2)],
          ["Height", formatLength(design.heightM)],
          ["Floors", formatInt(design.floors.length)],
        ].map(([label, value]) => (
          <div key={label} className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="font-mono font-medium text-sm tabular">{value}</dd>
          </div>
        ))}
      </dl>
      <SectionPreview
        design={design}
        input={scene.input}
        envelope={envelope}
        selected={selectedFloor === null ? [] : [selectedFloor]}
        breaches={breaches}
        onSelect={(levels) => {
          const view = useResultsView.getState();
          const level = levels[0] ?? null;
          view.setSelectedFloor(view.selectedFloor === level && levels.length === 1 ? null : level);
          if (isVariant) useStudio.getState().setSelection({ levels, anchor: levels[0] ?? null });
        }}
      />
      <div className="flex flex-wrap gap-2 py-4">
        <Button
          size="sm"
          onClick={() =>
            isVariant ? useResultsView.getState().setEditing(true) : customise(design)
          }
        >
          <PencilRuler /> {isVariant ? "Edit" : "Edit a copy"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => downloadSchedule(design)}>
          <Download /> CSV
        </Button>
        <Button variant="ghost" size="sm" onClick={printSummary}>
          <Printer /> Print
        </Button>
      </div>
      <Fold
        title="Checks"
        aside={countsText(design.checks)}
        defaultOpen={!design.passes}
        testId="scheme-checks"
      >
        <Checklist checks={design.checks} />
      </Fold>
      <FloorSchedule design={design} />
    </div>
  );
}

/** The schemes for this plot, and the selected one: its section, checks and floors, or its editor. */
export function SchemesSection({ onCompare }: { onCompare: () => void }) {
  const { state, scene, entries, recommended } = useOptions();
  const selected = useResultsView((s) => s.selectedDesign);
  const editing = useResultsView((s) => s.editing);
  const variants = useStudio((s) => s.variants);
  const design = scene?.design ?? null;

  useEffect(() => {
    if (!scene || selected !== null) return;
    const first = recommended ?? entries[0]?.id ?? null;
    const entry = entries.find((e) => e.id === first);
    if (first && entry?.design)
      useResultsView.getState().selectDesign(first, entry.design.envelope);
  }, [scene, selected, recommended, entries]);

  if (!scene) return <EngineGuidance state={state} />;

  const variant = variantById(variants, selected);
  if (editing && variant) {
    return (
      <div className="grid gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit"
          onClick={() => useResultsView.getState().setEditing(false)}
        >
          <ArrowLeft /> All schemes
        </Button>
        <StudioEditor id={variant.id} scene={scene} onPrint={printSummary} />
      </div>
    );
  }

  return (
    <div className="grid gap-4" data-testid="options-step">
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
          No scheme fits inside the allowed space on this plot. Enlarge the plot, or check the road
          width and the rule switches under Plot and Rules.
        </p>
      ) : (
        <div className="grid gap-1">
          <div className="flex items-center justify-between pb-1">
            <h2 className="font-medium text-muted-foreground text-xs">{entries.length} schemes</h2>
            {entries.length > 1 && (
              <Button variant="ghost" size="sm" className="-mr-2 h-7" onClick={onCompare}>
                <Rows3 /> Compare
              </Button>
            )}
          </div>
          <ul className="grid gap-0.5" data-testid="designs">
            {entries.map((entry) => (
              <li key={entry.id}>
                <SchemeRow entry={entry} selected={entry.id === selected} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {design && (
        <div className="border-t pt-4">
          <SchemeOverview scene={scene} design={design} />
        </div>
      )}
    </div>
  );
}
