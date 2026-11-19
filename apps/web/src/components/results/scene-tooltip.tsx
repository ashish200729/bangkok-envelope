import type { ScenePick } from "@/components/map/envelope-layers";
import { floorLabel, formatArea, formatBand } from "@/lib/results/format";

export type SceneHover = { pick: ScenePick; x: number; y: number };

export function pickLabel(pick: ScenePick): string {
  if (pick.kind === "floor") return floorLabel(pick.floor);
  const name = pick.envelopeKind === "highRise" ? "High-rise envelope" : "Low-rise envelope";
  return `${name} · ${formatBand(pick.z0M, pick.z1M)} · ${formatArea(pick.areaM2)} allowed`;
}

export function SceneTooltip({ hover }: { hover: SceneHover }) {
  return (
    <div
      role="tooltip"
      data-testid="scene-tooltip"
      className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2 py-1 font-medium text-popover-foreground text-xs shadow-md"
      style={{ left: hover.x + 14, top: hover.y + 14 }}
    >
      {pickLabel(hover.pick)}
    </div>
  );
}
