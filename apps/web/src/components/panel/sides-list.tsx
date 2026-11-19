"use client";

import type { LngLat } from "@envelope/engine";
import { Button } from "@envelope/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@envelope/ui/components/select";
import { cn } from "@envelope/ui/lib/utils";
import { useEffect, useMemo, useRef } from "react";
import { sideRole, type VertexId } from "@/lib/plot/draft";
import { formatM } from "@/lib/plot/format";
import { sideLengthsM } from "@/lib/plot/geometry";
import { usePlotStore } from "@/lib/plot/store";
import { acceptSideSuggestion } from "@/lib/site/actions";
import { osmRoadName, sideSuggestionText } from "@/lib/site/suggest";
import { useSiteSuggestions } from "@/lib/site/use-suggestions";

const NEW_ROAD = "__new-road__";
const BOUNDARY = "__boundary__";

export function SidesList({ vertices }: { vertices: readonly LngLat[] }) {
  const draft = usePlotStore((s) => s.draft);
  const roads = usePlotStore((s) => s.roads);
  const hovered = usePlotStore((s) => s.hoveredSide);
  const selected = usePlotStore((s) => s.selectedSide);
  const lengths = useMemo(() => sideLengthsM(vertices), [vertices]);
  const suggestions = useSiteSuggestions().sides;
  const rowRefs = useRef(new Map<VertexId, HTMLLIElement>());

  useEffect(() => {
    if (selected) rowRefs.current.get(selected)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function onRoleChange(side: VertexId, value: string) {
    const store = usePlotStore.getState();
    if (value === NEW_ROAD) store.addRoadForSide(side);
    else if (value === BOUNDARY) store.setSideRole(side, { kind: "boundary" });
    else store.setSideRole(side, { kind: "road", roadId: value });
    store.setSelectedSide(side);
  }

  return (
    <ol className="grid gap-1" data-testid="sides">
      {draft.vertices.map((v, i) => {
        const role = sideRole(draft, v.id);
        const active = v.id === hovered || v.id === selected;
        const suggestion = suggestions.get(v.id);
        return (
          <li
            key={v.id}
            ref={(el) => {
              if (el) rowRefs.current.set(v.id, el);
              else rowRefs.current.delete(v.id);
            }}
            onMouseEnter={() => usePlotStore.getState().setHoveredSide(v.id)}
            onMouseLeave={() => usePlotStore.getState().setHoveredSide(null)}
            className={cn(
              "grid grid-cols-[2rem_1fr_9.5rem] items-center gap-x-2 gap-y-1 rounded-md px-2 py-1.5",
              active && "bg-accent",
            )}
          >
            <span className="font-mono text-muted-foreground text-xs tabular">{i + 1}</span>
            <span className="font-mono text-sm tabular">{formatM(lengths[i] ?? 0)}</span>
            <Select
              value={role.kind === "road" ? role.roadId : BOUNDARY}
              onValueChange={(value) => onRoleChange(v.id, value)}
            >
              <SelectTrigger size="sm" className="w-full" aria-label={`Side ${i + 1} faces`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BOUNDARY}>Neighbour</SelectItem>
                {roads.map((road) => (
                  <SelectItem key={road.id} value={road.id}>
                    {road.name ?? "Road"} ({road.widthM} m)
                  </SelectItem>
                ))}
                <SelectItem value={NEW_ROAD}>New road…</SelectItem>
              </SelectContent>
            </Select>
            {suggestion && (
              <div
                className="col-span-2 col-start-2 flex min-w-0 items-center justify-between gap-2"
                data-testid="side-suggestion"
              >
                <span className="truncate text-muted-foreground text-xs">
                  {sideSuggestionText(suggestion)}
                </span>
                <Button
                  variant="outline"
                  size="xs"
                  aria-label={`Mark side ${i + 1} as facing ${osmRoadName(suggestion)}`}
                  onClick={() => {
                    acceptSideSuggestion(v.id, suggestion);
                    usePlotStore.getState().setSelectedSide(v.id);
                  }}
                >
                  Apply
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
