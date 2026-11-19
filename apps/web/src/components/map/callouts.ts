import type { Map as MapLibreMap } from "maplibre-gl";
import type { Callout } from "@/lib/scene/annotations";

export type Project = (position: [number, number, number]) => [number, number] | null;

const BASE =
  "pointer-events-none absolute top-0 left-0 whitespace-nowrap rounded-md border px-1.5 py-0.5 font-medium text-[11px] leading-4 shadow-sm will-change-transform";
const KIND_CLASS: Record<Callout["kind"], string> = {
  height: "bg-popover text-popover-foreground font-mono tabular text-xs",
  road: "bg-popover/95 text-muted-foreground",
  setback: "border-red-300/70 bg-popover/95 text-red-700 dark:border-red-400/40 dark:text-red-300",
};

/**
 * Small labels anchored to points in 3D (height over the roof, road widths, setbacks), drawn as
 * HTML above the map and moved every frame, so they stay crisp and follow the theme.
 */
export function createCallouts(map: MapLibreMap, project: Project) {
  const layer = document.createElement("div");
  layer.className = "pointer-events-none absolute inset-0 overflow-hidden";
  layer.dataset.testid = "scene-callouts";
  map.getContainer().appendChild(layer);
  let items: { callout: Callout; el: HTMLDivElement }[] = [];

  function place() {
    const { clientWidth: w, clientHeight: h } = layer;
    for (const { callout, el } of items) {
      const pt = project(callout.position);
      const visible = pt && pt[0] > -40 && pt[0] < w + 40 && pt[1] > -20 && pt[1] < h + 20;
      el.style.visibility = visible ? "visible" : "hidden";
      if (pt) {
        const lift = callout.kind === "height" ? "-100%" : "-50%";
        el.style.transform = `translate(${pt[0]}px, ${pt[1]}px) translate(-50%, ${lift})`;
      }
    }
  }

  map.on("render", place);

  return {
    update(callouts: Callout[]) {
      const byId = new Map(items.map((item) => [item.callout.id, item]));
      const next: typeof items = [];
      for (const callout of callouts) {
        const existing = byId.get(callout.id);
        const el = existing?.el ?? document.createElement("div");
        if (!existing) layer.appendChild(el);
        el.className = `${BASE} ${KIND_CLASS[callout.kind]}`;
        el.dataset.callout = callout.kind;
        if (el.textContent !== callout.text) el.textContent = callout.text;
        byId.delete(callout.id);
        next.push({ callout, el });
      }
      for (const stale of byId.values()) stale.el.remove();
      items = next;
      place();
    },
    destroy() {
      map.off("render", place);
      layer.remove();
    },
  };
}
