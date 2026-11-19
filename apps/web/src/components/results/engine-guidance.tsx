"use client";

import type { EngineErrorCode } from "@envelope/engine";
import { Button } from "@envelope/ui/components/button";
import { Skeleton } from "@envelope/ui/components/skeleton";
import { CircleAlert, PencilLine } from "lucide-react";
import type { ReactNode } from "react";
import { buildingsText } from "@/components/map/draw-hud";
import type { EngineState } from "@/lib/engine/store";
import { latestComputed } from "@/lib/engine/store";
import { buildingCount } from "@/lib/plot/clearance";
import { usePlotStore } from "@/lib/plot/store";
import { useSiteHold } from "@/lib/plot/use-site-hold";
import { useResultsView } from "@/lib/results/view";

const GUIDANCE: Record<EngineErrorCode, { title: string; fix: string }> = {
  "no-road-edge": {
    title: "Mark the side that faces a road",
    fix: "Thai law requires every plot to reach a public road, and the road's width sets the height limit. In Plot, set at least one side to face a road and enter its width.",
  },
  "self-intersecting": {
    title: "The outline crosses itself",
    fix: "Drag the corners on the map until no two sides cross, or draw the plot again.",
  },
  "too-small": {
    title: "Nothing is left to build on",
    fix: "After the setbacks from the road and the neighbours, no part of this plot remains. Enlarge the plot, or check the road width.",
  },
  degenerate: {
    title: "The plot needs at least three corners",
    fix: "Some corners sit on top of each other. Draw the plot again with three or more distinct corners.",
  },
};

/** What to show instead of results: a loading state or plain guidance. Null when results exist. */
export function EngineGuidance({ state }: { state: EngineState }) {
  const mode = usePlotStore((s) => s.mode);
  const openPlot = () => useResultsView.getState().setSection("plot");
  const hold = useSiteHold();
  const computed = latestComputed(state);

  if (mode === "draw") {
    return (
      <Note
        title="Drawing a new plot"
        text="Finish the outline on the map (click the first corner to close it) to see the rules and the allowed space."
      />
    );
  }
  if (hold.held && hold.reason === "buildings") {
    const count = buildingCount(hold.clearance);
    return (
      <Note
        title={`This plot covers ${buildingsText(count)}`}
        text={`The rules assume the site is cleared. Confirm on the map that ${count === 1 ? "it" : "they"} will be demolished, or redraw the plot on open land.`}
        code="existing-buildings"
      >
        <Button
          size="sm"
          className="w-fit"
          onClick={() => usePlotStore.getState().confirmDemolition()}
        >
          Confirm demolition
        </Button>
      </Note>
    );
  }
  if (state.status === "invalid") {
    return (
      <Note title="This plot cannot be checked yet" text="Fix these in Plot:">
        <ul className="list-disc pl-5 text-muted-foreground">
          {state.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
        <PlotButton onClick={openPlot} />
      </Note>
    );
  }
  if (!computed || hold.held) {
    return (
      <div className="grid gap-3" data-testid="results-loading" aria-busy="true">
        <p className="text-muted-foreground text-sm">Checking the rules for this plot…</p>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (computed.result.ok) return null;
  const guidance = GUIDANCE[computed.result.error.code];
  return (
    <Note title={guidance.title} text={guidance.fix} code={computed.result.error.code}>
      <PlotButton onClick={openPlot} />
    </Note>
  );
}

function PlotButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" className="w-fit" onClick={onClick}>
      <PencilLine /> Go to the plot
    </Button>
  );
}

function Note({
  title,
  text,
  code,
  children,
}: {
  title: string;
  text: string;
  code?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="status"
      data-testid="results-guidance"
      data-code={code}
      className="grid gap-3 rounded-lg border border-warn/40 bg-warn/8 p-4 text-sm"
    >
      <p className="flex items-start gap-2 font-medium">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
        {title}
      </p>
      <p className="text-muted-foreground">{text}</p>
      {children}
    </div>
  );
}
