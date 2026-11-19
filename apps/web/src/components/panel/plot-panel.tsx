"use client";

import {
  BUILDING_TYPE_INFO,
  BUILDING_TYPES,
  type BuildingType,
  ZONE_CODES,
  ZONES,
  type ZoneCode,
} from "@envelope/engine";
import { Button } from "@envelope/ui/components/button";
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
import { type ReactNode, useMemo } from "react";
import { sideRole } from "@/lib/plot/draft";
import { toEngineInput } from "@/lib/plot/engine-input";
import { formatM, formatM2, formatThaiLandArea } from "@/lib/plot/format";
import { areaM2, perimeterM } from "@/lib/plot/geometry";
import { usePlotStore } from "@/lib/plot/store";
import { RoadsList } from "./roads-list";
import { SidesList } from "./sides-list";
import { SiteAttribution, SiteStatus } from "./site-status";
import { StationField } from "./station-field";

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
  const perimeter = useMemo(() => perimeterM(vertices), [vertices]);
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
        <p className="text-muted-foreground text-sm" data-testid="plot-perimeter">
          Perimeter <span className="font-mono text-foreground tabular">{formatM(perimeter)}</span>{" "}
          · {vertices.length} sides
        </p>
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
        <SiteStatus />
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
        <StationField />
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

      <SiteAttribution />
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
