"use client";

import { Input } from "@envelope/ui/components/input";
import { Slider } from "@envelope/ui/components/slider";
import { cn } from "@envelope/ui/lib/utils";
import { type ReactNode, useRef, useState } from "react";

let gestureCount = 0;
const newGesture = (id: string) => {
  gestureCount += 1;
  return `${id}:${gestureCount}`;
};

const decimalsOf = (step: number) => (String(step).split(".")[1] ?? "").length;
export const snap = (value: number, step: number) => {
  const d = decimalsOf(step);
  return Number((Math.round(value / step) * step).toFixed(d));
};

/**
 * A slider paired with a number field. A whole drag (or a typing session in the field) is one
 * gesture, so it undoes as one step. Typed values may go beyond the slider's range, up to the
 * field's own limits.
 */
export function SliderField({
  id,
  label,
  value,
  min,
  max,
  step,
  sliderMin = min,
  sliderMax = max,
  unit,
  onChange,
  onEnd,
  disabled,
  invalid,
  hint,
  className,
}: {
  id: string;
  label: ReactNode;
  value: number | null;
  min: number;
  max: number;
  step: number;
  sliderMin?: number;
  sliderMax?: number;
  unit: string;
  onChange: (value: number, gesture: string | undefined) => void;
  onEnd: () => void;
  disabled?: boolean;
  invalid?: boolean;
  hint?: ReactNode;
  className?: string;
}) {
  const drag = useRef<string | null>(null);
  const typing = useRef<string | null>(null);
  const show = (v: number | null) => (v === null ? "" : String(snap(v, step)));
  const [text, setText] = useState(show(value));
  const [seen, setSeen] = useState(value);
  const [refused, setRefused] = useState(false);
  if (seen !== value) {
    setSeen(value);
    if (typing.current === null) setText(show(value));
  }
  const clamp = (v: number) => Math.min(sliderMax, Math.max(sliderMin, v));
  const hintId = `${id}-hint`;

  return (
    <div className={cn("grid gap-1.5", className)} data-invalid={invalid || undefined}>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className={cn("text-sm", invalid ? "font-medium text-fail" : "text-foreground")}
        >
          {label}
        </label>
        <div className="flex items-center gap-1.5">
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            placeholder={value === null ? "Mixed" : undefined}
            className={cn(
              "h-7 w-20 px-2 text-right font-mono text-sm tabular",
              invalid && "border-fail",
            )}
            value={text}
            aria-invalid={refused || invalid || undefined}
            aria-describedby={hint || refused ? hintId : undefined}
            onFocus={() => {
              typing.current = newGesture(id);
            }}
            onChange={(e) => {
              setText(e.target.value);
              const n = Number(e.target.value);
              if (e.target.value.trim() === "" || !Number.isFinite(n) || n < min || n > max) {
                setRefused(true);
                return;
              }
              setRefused(false);
              onChange(snap(n, step / 10), typing.current ?? undefined);
            }}
            onBlur={() => {
              typing.current = null;
              setText(show(value));
              setRefused(false);
              onEnd();
            }}
          />
          <span className="w-7 text-muted-foreground text-xs">{unit}</span>
        </div>
      </div>
      <Slider
        aria-label={typeof label === "string" ? label : id}
        min={sliderMin}
        max={sliderMax}
        step={step}
        disabled={disabled}
        value={[clamp(value ?? sliderMin)]}
        onPointerDown={() => {
          drag.current = newGesture(id);
        }}
        onValueChange={([v]) => {
          if (v !== undefined) onChange(snap(v, step), drag.current ?? undefined);
        }}
        onValueCommit={() => {
          drag.current = null;
          onEnd();
        }}
        className={cn("py-1.5", invalid && "[&_[data-slot=slider-range]]:bg-fail")}
      />
      {(refused || hint) && (
        <p
          id={hintId}
          className={cn("text-xs", refused || invalid ? "text-fail" : "text-muted-foreground")}
        >
          {refused ? `Enter ${min} to ${max} ${unit}.` : hint}
        </p>
      )}
    </div>
  );
}
