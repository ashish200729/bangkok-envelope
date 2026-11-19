"use client";

import {
  BUILDING_TYPE_INFO,
  BUILDING_TYPES,
  type BuildingType,
  type LngLat,
  ZONE_CODES,
  ZONES,
  type ZoneCode,
} from "@envelope/engine";
import { Button } from "@envelope/ui/components/button";
import { Input } from "@envelope/ui/components/input";
import { Label } from "@envelope/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@envelope/ui/components/select";
import { Separator } from "@envelope/ui/components/separator";
import { cn } from "@envelope/ui/lib/utils";
import { CircleAlert, CircleCheck, PencilLine, RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { sideRole, type VertexId } from "@/lib/plot/draft";
import { toEngineInput } from "@/lib/plot/engine-input";
import { formatM, formatM2, formatThaiLandArea } from "@/lib/plot/format";
import { areaM2, sideLengthsM } from "@/lib/plot/geometry";
import { usePlotStore } from "@/lib/plot/store";

const NEW_ROAD = "__new-road__";
const BOUNDARY = "__boundary__";
const TONE_TEXT = { pass: "text-pass", warn: "text-warn", fail: "text-fail" } as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3" aria-label={title}>
      <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function PlotPanel() {
  const draft = usePlotStore((s) => s.draft);
  const roads = usePlotStore((s) => s.roads);
  const settings = usePlotStore((s) => s.settings);
  const mode = usePlotStore((s) => s.mode);

  const vertices = useMemo(() => draft.vertices.map((v) => v.lngLat), [draft.vertices]);
  const area = useMemo(() => areaM2(vertices), [vertices]);
  const check = useMemo(() => toEngineInput(draft, roads, settings), [draft, roads, settings]);
  const hasRoad = draft.vertices.some((v) => sideRole(draft, v.id).kind === "road");

  return (
    <div className="grid gap-6 p-5">
      <Section title="Plot">
        <div className="flex items-baseline justify-between gap-4">
          <p className="font-semibold text-2xl tabular" data-testid="plot-area">
            {formatM2(area)}
          </p>
          <p className="text-muted-foreground text-sm">{formatThaiLandArea(area)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === "draw" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => usePlotStore.getState().cancelDrawing()}
            >
              Cancel drawing
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => usePlotStore.getState().startDrawing()}
            >
              <PencilLine /> Draw a new plot
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => usePlotStore.getState().resetToSample()}>
            <RotateCcw /> Sample plot
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Drag corners to reshape. Drag a midpoint to add a corner. Right-click a corner to remove
          it.
        </p>
      </Section>

      <Separator />

      <Section title="Sides">
        <SidesList vertices={vertices} />
      </Section>

      {roads.length > 0 && (
        <>
          <Separator />
          <Section title="Roads">
            <RoadsList />
          </Section>
        </>
      )}

      <Separator />

      <Section title="Zone and building">
        <div className="grid gap-1.5">
          <Label htmlFor="zone">Zone (2013 Bangkok plan)</Label>
          <Select
            value={settings.zone}
            onValueChange={(v) => usePlotStore.getState().setZone(v as ZoneCode)}
          >
            <SelectTrigger id="zone" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ZONE_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {ZONES[code].labelTh} · {ZONES[code].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="building-type">Building type</Label>
          <Select
            value={settings.buildingType}
            onValueChange={(v) => usePlotStore.getState().setBuildingType(v as BuildingType)}
          >
            <SelectTrigger id="building-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUILDING_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {BUILDING_TYPE_INFO[type].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="station-distance">Distance to nearest BTS/MRT station</Label>
          <div className="flex items-center gap-2">
            <Input
              id="station-distance"
              type="number"
              inputMode="numeric"
              min={0}
              step={10}
              placeholder="Unknown"
              value={settings.stationDistanceM ?? ""}
              onChange={(e) => {
                const value = e.target.value === "" ? null : Number(e.target.value);
                if (value === null || (Number.isFinite(value) && value >= 0)) {
                  usePlotStore.getState().setStationDistance(value);
                }
              }}
            />
            <span className="text-muted-foreground text-sm">m</span>
          </div>
          <p className="text-muted-foreground text-xs">
            Within 500 m of a station, some size limits for offices and hotels are relaxed.
          </p>
        </div>
      </Section>

      <Separator />

      <div role="status" data-testid="input-status" className="grid gap-2 text-sm">
        {mode === "draw" ? (
          <p className="text-muted-foreground">Finish drawing the plot to continue.</p>
        ) : !check.ok ? (
          <StatusLine tone="fail" text="This plot cannot be checked yet:">
            <ul className="list-disc pl-5 text-muted-foreground">
              {check.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </StatusLine>
        ) : !hasRoad ? (
          <StatusLine
            tone="warn"
            text="Mark at least one side that faces a public road. Thai law requires road access, and road width sets the height limit."
          />
        ) : (
          <StatusLine tone="pass" text="Plot ready for the rules check." />
        )}
      </div>
    </div>
  );
}

function StatusLine({
  tone,
  text,
  children,
}: {
  tone: "pass" | "warn" | "fail";
  text: string;
  children?: ReactNode;
}) {
  const Icon = tone === "pass" ? CircleCheck : CircleAlert;
  return (
    <div className="grid gap-1">
      <p className={cn("flex items-start gap-2", TONE_TEXT[tone])}>
        <Icon className="mt-0.5 size-4 shrink-0" />
        <span>{text}</span>
      </p>
      {children}
    </div>
  );
}

function SidesList({ vertices }: { vertices: readonly LngLat[] }) {
  const draft = usePlotStore((s) => s.draft);
  const roads = usePlotStore((s) => s.roads);
  const hovered = usePlotStore((s) => s.hoveredSide);
  const selected = usePlotStore((s) => s.selectedSide);
  const lengths = useMemo(() => sideLengthsM(vertices), [vertices]);
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
              "grid grid-cols-[2rem_1fr_9.5rem] items-center gap-2 rounded-md px-2 py-1.5",
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
          </li>
        );
      })}
    </ol>
  );
}

function RoadsList() {
  const roads = usePlotStore((s) => s.roads);
  return (
    <div className="grid gap-3">
      {roads.map((road) => (
        <div key={road.id} className="grid gap-1.5">
          <Label htmlFor={`road-${road.id}`}>{road.name ?? "Road"} width</Label>
          <div className="flex items-center gap-2">
            <Input
              id={`road-${road.id}`}
              type="number"
              inputMode="decimal"
              min={1}
              max={200}
              step={0.5}
              defaultValue={road.widthM}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value) && value > 0 && value <= 200) {
                  usePlotStore.getState().setRoadWidth(road.id, value);
                }
              }}
            />
            <span className="text-muted-foreground text-sm">m</span>
          </div>
        </div>
      ))}
      <p className="text-muted-foreground text-xs">
        Legal road width (เขตทาง): from property line to property line, including footpaths and
        drains.
      </p>
    </div>
  );
}
