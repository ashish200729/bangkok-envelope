"use client";

import type { DesignId } from "@envelope/engine";
import { Button } from "@envelope/ui/components/button";
import { SlidersHorizontal } from "lucide-react";
import type { Scene } from "@/lib/results/scene";
import { type AnyDesign, useResultsView } from "@/lib/results/view";
import { customise } from "@/lib/studio/actions";
import { useStudio } from "@/lib/studio/store";
import { GENERATED_BADGE } from "@/lib/studio/variant";
import { OptionBadge } from "../results/option-card";
import { StudioEditor } from "./editor";

/** The Customise tab: the editor for a variant, or a way to make one from a generated option. */
export function CustomiseTab({
  scene,
  design,
  onPrint,
}: {
  scene: Scene;
  design: AnyDesign;
  onPrint: () => void;
}) {
  const variants = useStudio((s) => s.variants);
  const own = variants.find((v) => v.id === design.id);
  if (own) return <StudioEditor id={own.id} scene={scene} onPrint={onPrint} />;

  const badge = GENERATED_BADGE[design.id as DesignId] ?? "?";
  const made = variants.filter((v) => v.source.id === design.id);
  return (
    <div className="grid gap-4" data-testid="customise-start">
      <div className="grid gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2.5">
          <OptionBadge badge={badge} custom={false} />
          <p className="font-semibold">{design.name}</p>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Make your own version of this option. Change each floor's use and height, add or remove
          floors, resize and move the tower, or let it break the envelope to see which rules fail.
          Every change is rebuilt and checked by the same rules, live on the map.
        </p>
        <Button className="w-fit" onClick={() => customise(design)}>
          <SlidersHorizontal /> Customise {badge}
        </Button>
        <p className="text-muted-foreground text-xs">
          The original stays as it is. Your versions are kept in this browser, for this plot.
        </p>
      </div>
      {made.length > 0 && (
        <div className="grid gap-2">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Your versions of {badge}
          </p>
          <ul className="grid gap-1.5">
            {made.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm hover:border-foreground/25"
                  onClick={() => {
                    const view = useResultsView.getState();
                    view.selectDesign(v.id, v.history.present.envelope);
                    view.setOptionTab("customise");
                  }}
                >
                  <OptionBadge badge={v.badge} custom />
                  {v.history.present.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
