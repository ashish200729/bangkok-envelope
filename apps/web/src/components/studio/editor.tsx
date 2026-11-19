"use client";

import type { CustomDesignId } from "@envelope/engine";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@envelope/ui/components/collapsible";
import { cn } from "@envelope/ui/lib/utils";
import { ArrowRight, ChevronDown, CircleAlert, LoaderCircle } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import type { Scene } from "@/lib/results/scene";
import { failingTargets } from "@/lib/studio/checks";
import { useVariant } from "@/lib/studio/use-variant";
import { StatusPill } from "../results/bits";
import { FloorStack } from "./floor-stack";
import { MassingControls } from "./massing-controls";
import { MetricsStrip } from "./metrics-strip";
import { VariantHeader } from "./variant-header";

function Section({
  title,
  aside,
  children,
  defaultOpen = true,
  invalid,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  invalid?: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="grid gap-3">
      <CollapsibleTrigger className="group flex items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring">
        <ChevronDown
          className="size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90"
          aria-hidden
        />
        <h3
          className={cn(
            "font-medium text-xs uppercase tracking-wider",
            invalid ? "text-fail" : "text-muted-foreground",
          )}
        >
          {title}
        </h3>
        {aside && <span className="ml-auto">{aside}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

const STATUS_WORD = {
  pass: "passes",
  fail: "fails",
  warn: "needs a check",
  "n/a": "does not apply",
} as const;

/** The design studio for one variant: figures, massing, the floor stack and what each edit changed. */
export function StudioEditor({
  id,
  scene,
  onPrint,
}: {
  id: CustomDesignId;
  scene: Scene;
  onPrint: () => void;
}) {
  const { variant, build, changes, baseline, edit, end } = useVariant(id, scene.result.designs);
  const design = build?.design ?? null;
  const failing = useMemo(() => failingTargets(design?.checks ?? []), [design]);
  if (!variant) return null;
  const spec = variant.history.present;
  const updating = build?.status === "building";
  const error = build?.status === "error" ? build : null;
  const resetSpec = baseline?.spec ?? variant.original;
  const envelope =
    spec.envelope === "highRise"
      ? (scene.result.envelopes.highRise ?? scene.result.envelopes.lowRise)
      : scene.result.envelopes.lowRise;

  return (
    <div className="grid gap-5" data-testid="studio-editor" data-variant={id}>
      <VariantHeader variant={variant} design={design} resetSpec={resetSpec} onPrint={onPrint} />

      {design ? (
        <MetricsStrip
          design={design}
          baseline={baseline}
          input={scene.input}
          failing={new Set(failing.keys())}
          updating={updating}
        />
      ) : (
        <div className="flex h-16 items-center gap-2 rounded-lg border border-dashed px-3 text-muted-foreground text-sm">
          {error ? null : <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          {error ? "No building to measure yet." : "Building your variant…"}
        </div>
      )}

      <div aria-live="polite" className="sr-only" data-testid="studio-status">
        {updating
          ? "Updating"
          : error
            ? error.message
            : design
              ? `${design.passes ? "Passes" : "Fails"} the checklist`
              : ""}
      </div>

      {error && (
        <div
          role="alert"
          data-testid="build-error"
          className="flex items-start gap-2 rounded-lg border border-fail/40 bg-fail/6 p-3 text-sm"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-fail" aria-hidden />
          <div className="grid gap-1">
            <p className="font-medium">This edit leaves nothing to build</p>
            <p className="text-muted-foreground">{error.message}</p>
            <p className="text-muted-foreground text-xs">Undo the last change, or adjust it.</p>
          </div>
        </div>
      )}

      {changes.length > 0 && (
        <section
          aria-label="What changed"
          className="grid gap-1.5 rounded-lg border bg-card p-3"
          data-testid="what-changed"
        >
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            What changed
          </p>
          <ul className="grid gap-1.5">
            {changes.map(({ check, from, to }) => (
              <li
                key={`${check.ruleId}-${check.message}`}
                className="flex items-start gap-2 text-sm"
              >
                <StatusPill status={to} className="mt-0.5" />
                <span className="leading-snug">
                  {check.label} now {STATUS_WORD[to]}
                  {from !== "new" && <span className="text-muted-foreground"> (was {from})</span>}
                  <span className="block text-muted-foreground text-xs">{check.message}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Section
        title="Floors"
        invalid={failing.has("floors")}
        aside={
          <span className="font-mono text-muted-foreground text-xs tabular">
            {spec.floors.length} floors
          </span>
        }
      >
        <FloorStack
          variantId={id}
          spec={spec}
          design={design}
          input={scene.input}
          envelope={envelope}
          breaches={build?.breaches ?? []}
          edit={edit}
          end={end}
          floorsFail={failing.has("floors")}
        />
      </Section>

      <Section
        title="Massing"
        invalid={failing.has("fit") || failing.has("tower") || failing.has("envelope")}
      >
        <MassingControls
          spec={spec}
          result={scene.result}
          input={scene.input}
          edit={edit}
          end={end}
          failing={failing}
        />
      </Section>

      <p className="flex items-center gap-1 text-muted-foreground text-xs">
        Every change is rebuilt and checked by the same rules as options A–C
        <ArrowRight className="size-3" aria-hidden /> the map shows it live.
      </p>
    </div>
  );
}
