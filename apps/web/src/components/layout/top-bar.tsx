"use client";

import { Button } from "@envelope/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@envelope/ui/components/tooltip";
import { cn } from "@envelope/ui/lib/utils";
import { Check, CircleAlert, Info, PencilLine } from "lucide-react";
import { useEngineStore } from "@/lib/engine/store";
import { usePlotStore } from "@/lib/plot/store";
import { type Step, useResultsView } from "@/lib/results/view";
import { currentContext } from "@/lib/site/request";
import { useSiteStore } from "@/lib/site/store";
import { ThemeToggle } from "../theme-toggle";

export const NOTICE = "A concept study, not a design. An architect must check and sign.";

const STEPS: { id: Step; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "site", label: "Site and rules" },
  { id: "options", label: "Options" },
];

export function startOver() {
  const view = useResultsView.getState();
  view.goToSite("plot");
  view.selectDesign(null);
  usePlotStore.getState().startDrawing();
}

function useLocation(): string {
  const request = useSiteStore((s) => s.request);
  const station = currentContext(request)?.nearestStation ?? null;
  return `${station?.nameEn ?? "Asok"}, Bangkok`;
}

/** Step state: done, needs attention, or neutral. */
function useStepState(): Record<Step, "done" | "attention" | null> {
  const status = useEngineStore((s) => s.state.status);
  const ok = useEngineStore((s) =>
    s.state.status === "ready"
      ? s.state.result.ok
      : s.state.status === "computing"
        ? (s.state.previous?.result.ok ?? null)
        : null,
  );
  const mode = usePlotStore((s) => s.mode);
  const site =
    mode === "draw" || status === "invalid" || ok === false ? "attention" : ok ? "done" : null;
  return { brief: "done", site, options: null };
}

export function StepsNav({ className }: { className?: string }) {
  const step = useResultsView((s) => s.step);
  const states = useStepState();
  return (
    <nav aria-label="Steps" className={className}>
      <ol className="flex items-center gap-1">
        {STEPS.map(({ id, label }, i) => {
          const current = step === id;
          const state = states[id];
          return (
            <li key={id} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden className="h-px w-3 bg-border sm:w-5" />}
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                onClick={() => useResultsView.getState().setStep(id)}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-full pr-3 pl-1 font-medium text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                  current
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-6 place-items-center rounded-full font-mono text-xs",
                    current ? "bg-background/15" : "bg-muted",
                    !current && state === "attention" && "bg-warn/20 text-warn",
                  )}
                >
                  {!current && state === "done" ? (
                    <Check className="size-3.5" />
                  ) : !current && state === "attention" ? (
                    <CircleAlert className="size-3.5" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="whitespace-nowrap">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function TopBar() {
  const location = useLocation();
  const drawing = usePlotStore((s) => s.mode === "draw");
  return (
    <header className="flex shrink-0 flex-col border-b bg-background">
      <div className="flex h-14 items-center gap-3 px-4">
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md bg-primary">
          <span className="size-3 rounded-[2px] border-2 border-primary-foreground" />
        </span>
        <div className="grid min-w-0 leading-tight">
          <h1 className="truncate font-semibold text-sm tracking-tight">Bangkok Plot Envelope</h1>
          <p className="truncate text-muted-foreground text-xs" data-testid="study-location">
            Concept study · {location}
          </p>
        </div>
        <StepsNav className="mx-auto hidden md:block" />
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="hidden h-7 max-w-[23rem] items-center gap-1.5 truncate rounded-full border bg-muted/50 px-2.5 text-muted-foreground text-xs xl:inline-flex"
                data-testid="honest-notice"
              >
                <Info className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{NOTICE}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              Figures come from published rules and averages. They show what may fit, not what will
              be approved.
            </TooltipContent>
          </Tooltip>
          <Button variant="outline" size="sm" disabled={drawing} onClick={startOver}>
            <PencilLine /> <span className="hidden sm:inline">Draw another plot</span>
            <span className="sm:hidden">New plot</span>
          </Button>
          <ThemeToggle />
        </div>
      </div>
      <StepsNav className="flex justify-center border-t px-2 py-1.5 md:hidden" />
      <p className="flex items-center gap-1.5 border-t px-4 py-1.5 text-muted-foreground text-xs xl:hidden">
        <Info className="size-3.5 shrink-0" aria-hidden />
        {NOTICE}
      </p>
    </header>
  );
}
