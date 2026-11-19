"use client";

import {
  type Check,
  type DesignSpec,
  defaultTowerSpec,
  type EngineInput,
  type EngineSuccess,
  type TowerSpec,
} from "@envelope/engine";
import { Button } from "@envelope/ui/components/button";
import { Label } from "@envelope/ui/components/label";
import { Switch } from "@envelope/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@envelope/ui/components/toggle-group";
import { cn } from "@envelope/ui/lib/utils";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CircleAlert, Plus } from "lucide-react";
import { type ReactNode, useId } from "react";
import type { CheckTarget } from "@/lib/studio/checks";
import { CitationLink } from "../results/bits";
import { SliderField, snap } from "./slider-field";

type Edit = (update: (spec: DesignSpec) => DesignSpec, gesture?: string) => void;

function FailNote({ checks }: { checks: readonly Check[] | undefined }) {
  if (!checks?.length) return null;
  return (
    <ul className="grid gap-1" data-testid="control-fail">
      {checks.map((check) => (
        <li
          key={`${check.ruleId}-${check.message}`}
          className="flex items-start gap-1.5 text-fail text-xs leading-snug"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            {check.message} <CitationLink source={check.source} className="text-fail/80" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function SwitchRow({
  label,
  detail,
  checked,
  onChange,
  invalid,
  testId,
}: {
  label: string;
  detail: ReactNode;
  checked: boolean;
  onChange: (on: boolean) => void;
  invalid?: boolean;
  testId: string;
}) {
  const id = useId();
  return (
    <div
      className="flex items-start justify-between gap-3"
      data-invalid={invalid || undefined}
      data-testid={testId}
    >
      <div className="grid gap-0.5">
        <Label htmlFor={id} className={cn("text-sm", invalid && "text-fail")}>
          {label}
        </Label>
        <p className="text-muted-foreground text-xs leading-snug">{detail}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}

const NUDGE_M = 0.5;

function Nudge({ tower, edit, end }: { tower: TowerSpec; edit: Edit; end: () => void }) {
  const shift = (dx: number, dy: number, big: boolean) => {
    const k = big ? 10 : 1;
    edit((s) =>
      s.tower
        ? {
            ...s,
            tower: {
              ...s.tower,
              offsetM: {
                x: snap(Math.max(-200, Math.min(200, s.tower.offsetM.x + dx * NUDGE_M * k)), 0.1),
                y: snap(Math.max(-200, Math.min(200, s.tower.offsetM.y + dy * NUDGE_M * k)), 0.1),
              },
            },
          }
        : s,
    );
    end();
  };
  const axis = (key: "x" | "y", label: string) => (
    <SliderField
      id={`tower-${key}`}
      label={label}
      value={tower.offsetM[key]}
      min={-200}
      max={200}
      sliderMin={-60}
      sliderMax={60}
      step={0.5}
      unit="m"
      onChange={(v, g) =>
        edit(
          (s) =>
            s.tower
              ? { ...s, tower: { ...s.tower, offsetM: { ...s.tower.offsetM, [key]: v } } }
              : s,
          g,
        )
      }
      onEnd={end}
    />
  );
  return (
    <div className="flex items-center gap-4">
      <div className="grid min-w-0 flex-1 gap-3">
        {axis("x", "Move east (+) or west")}
        {axis("y", "Move north (+) or south")}
      </div>
      <fieldset className="grid grid-cols-3 gap-0.5" aria-label="Move the tower">
        <span />
        <Button
          variant="outline"
          size="icon-xs"
          aria-label="Move the tower north"
          onClick={(e) => shift(0, 1, e.shiftKey)}
        >
          <ArrowUp />
        </Button>
        <span />
        <Button
          variant="outline"
          size="icon-xs"
          aria-label="Move the tower west"
          onClick={(e) => shift(-1, 0, e.shiftKey)}
        >
          <ArrowLeft />
        </Button>
        <span className="grid place-items-center text-[9px] text-muted-foreground">
          {NUDGE_M} m
        </span>
        <Button
          variant="outline"
          size="icon-xs"
          aria-label="Move the tower east"
          onClick={(e) => shift(1, 0, e.shiftKey)}
        >
          <ArrowRight />
        </Button>
        <span />
        <Button
          variant="outline"
          size="icon-xs"
          aria-label="Move the tower south"
          onClick={(e) => shift(0, -1, e.shiftKey)}
        >
          <ArrowDown />
        </Button>
        <span />
      </fieldset>
    </div>
  );
}

export function MassingControls({
  spec,
  result,
  input,
  edit,
  end,
  failing,
}: {
  spec: DesignSpec;
  result: EngineSuccess;
  input: EngineInput;
  edit: Edit;
  end: () => void;
  failing: ReadonlyMap<CheckTarget, Check[]>;
}) {
  const highRiseAllowed = result.envelopes.highRise !== null;
  const blocked = result.highRise.checks.find((c) => c.status === "fail");
  const tower = spec.tower;
  const towerUsed = spec.floors.some((f) => f.plate === "tower");
  const fitFails = failing.get("fit");
  const towerFails = towerUsed ? failing.get("tower") : undefined;
  const hotel = input.buildingType === "hotel";

  const setTower = (change: Partial<TowerSpec>, gesture?: string) =>
    edit((s) => (s.tower ? { ...s, tower: { ...s.tower, ...change } } : s), gesture);

  return (
    <div className="grid gap-4" data-testid="massing-controls">
      <div className="grid gap-1.5" data-invalid={failing.has("envelope") || undefined}>
        <span
          className={cn("text-sm", failing.has("envelope") && "font-medium text-fail")}
          id="envelope-label"
        >
          Envelope
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          className="w-full"
          aria-labelledby="envelope-label"
          value={spec.envelope}
          onValueChange={(v) => {
            if (v) {
              edit((s) => ({ ...s, envelope: v as DesignSpec["envelope"] }));
              end();
            }
          }}
        >
          <ToggleGroupItem value="lowRise" className="flex-1">
            Low-rise (under 23 m)
          </ToggleGroupItem>
          <ToggleGroupItem
            value="highRise"
            className="flex-1"
            disabled={!highRiseAllowed && spec.envelope !== "highRise"}
          >
            High-rise
          </ToggleGroupItem>
        </ToggleGroup>
        {!highRiseAllowed && (
          <p className="text-muted-foreground text-xs">
            High-rise not allowed here:{" "}
            {blocked?.message ?? "the site fails the high-rise access rules."}
          </p>
        )}
        <FailNote checks={failing.get("envelope")} />
      </div>

      <SwitchRow
        testId="straight-switch"
        label="Straight walls"
        detail="Every floor follows the strictest floor, so the walls rise without steps."
        checked={spec.straight}
        onChange={(on) => {
          edit((s) => ({ ...s, straight: on }));
          end();
        }}
      />
      <div className="grid gap-1.5">
        <SwitchRow
          testId="fit-switch"
          label="Fit to the envelope"
          invalid={Boolean(fitFails)}
          detail={
            spec.fitToEnvelope
              ? "Floors are cut to the allowed space, so nothing sticks out."
              : "Off: floors may break the envelope. The checklist shows where."
          }
          checked={spec.fitToEnvelope}
          onChange={(on) => {
            edit((s) => ({ ...s, fitToEnvelope: on }));
            end();
          }}
        />
        <FailNote checks={fitFails} />
      </div>

      <div
        className="grid gap-3 rounded-xl border p-3"
        data-invalid={towerFails ? true : undefined}
        data-testid="tower-controls"
      >
        <div className="flex items-center justify-between">
          <p className={cn("font-medium text-sm", towerFails && "text-fail")}>Tower</p>
          {!towerUsed && tower && (
            <span className="text-muted-foreground text-xs">No floor uses it yet</span>
          )}
        </div>
        {tower ? (
          <>
            <SliderField
              id="tower-width"
              label="Tower width"
              value={tower.widthM}
              min={8}
              max={120}
              step={0.5}
              unit="m"
              invalid={Boolean(towerFails)}
              onChange={(v, g) => setTower({ widthM: v }, g)}
              onEnd={end}
            />
            <SliderField
              id="tower-depth"
              label="Tower depth"
              value={tower.depthM}
              min={8}
              max={120}
              step={0.5}
              unit="m"
              invalid={Boolean(towerFails)}
              onChange={(v, g) => setTower({ depthM: v }, g)}
              onEnd={end}
            />
            <SliderField
              id="tower-rotation"
              label="Turn (clockwise from east)"
              value={tower.rotationDeg}
              min={-180}
              max={180}
              step={1}
              unit="°"
              onChange={(v, g) => setTower({ rotationDeg: v }, g)}
              onEnd={end}
            />
            <Nudge tower={tower} edit={edit} end={end} />
            <FailNote checks={towerFails} />
          </>
        ) : (
          <div className="grid gap-2">
            <p className="text-muted-foreground text-xs">
              This option has no tower. Add one, then set floors to the tower plate.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => {
                const t = defaultTowerSpec(input);
                if (t) edit((s) => ({ ...s, tower: t }));
                end();
              }}
            >
              <Plus /> Add a tower
            </Button>
          </div>
        )}
      </div>

      <SliderField
        id="unit-size"
        label={hotel ? "Floor area per room" : "Average unit size"}
        value={spec.unitSizeM2}
        min={20}
        max={400}
        sliderMin={20}
        sliderMax={hotel ? 150 : 200}
        step={1}
        unit="m²"
        invalid={failing.has("units")}
        hint={hotel ? "Gross floor area per hotel room." : "Net area of an average home."}
        onChange={(v, g) => edit((s) => ({ ...s, unitSizeM2: v }), g)}
        onEnd={end}
      />
    </div>
  );
}
