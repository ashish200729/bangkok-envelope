"use client";

import { Button } from "@envelope/ui/components/button";
import { Building2, PencilLine } from "lucide-react";
import { buildingCount, type Clearance } from "@/lib/plot/clearance";
import { formatM, formatM2 } from "@/lib/plot/format";
import { usePlotStore } from "@/lib/plot/store";
import { buildingsText } from "./draw-hud";

/**
 * Over the map when the plot covers buildings that stand there today: results wait until the
 * user confirms they will be demolished, or redraws the plot on open land.
 */
export function SiteClearanceCard({ clearance }: { clearance: Clearance }) {
  const count = buildingCount(clearance);
  return (
    <section
      role="alert"
      aria-labelledby="clearance-title"
      data-testid="site-clearance"
      className="absolute inset-x-3 bottom-3 z-10 mx-auto grid max-w-md gap-3 rounded-xl border border-fail/40 bg-background/95 p-4 shadow-lg backdrop-blur"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-fail/12 text-fail"
        >
          <Building2 className="size-4" />
        </span>
        <div className="grid gap-1">
          <h2 id="clearance-title" className="font-semibold text-sm">
            This plot covers {buildingsText(count)}
          </h2>
          <p className="text-muted-foreground text-xs leading-relaxed">
            About {formatM2(clearance.groundM2)} of built ground, up to{" "}
            {formatM(clearance.tallestM)} tall, shown in red (OpenStreetMap). The rules assume the
            site is cleared, so the plot is checked only once you confirm{" "}
            {count === 1 ? "it" : "they"} will be demolished.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => usePlotStore.getState().startDrawing()}>
          <PencilLine /> Redraw on open land
        </Button>
        <Button size="sm" onClick={() => usePlotStore.getState().confirmDemolition()}>
          Confirm demolition
        </Button>
      </div>
    </section>
  );
}
