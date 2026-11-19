"use client";

import { Input } from "@envelope/ui/components/input";
import { cn } from "@envelope/ui/lib/utils";
import { type ReactNode, useState } from "react";
import { type NumberRule, parseNumberInput } from "@/lib/plot/number-input";

const show = (value: number | null) => (value === null ? "" : String(value));

/**
 * A number input that keeps what the user typed. Text the rule refuses is marked invalid and
 * explained, and the value in use stays until the text is valid again; leaving the field puts the
 * value in use back. Values set elsewhere (Apply, Use detected) replace the text.
 */
export function NumberField({
  id,
  value,
  rule,
  onValue,
  unit,
  describe,
  step,
  inputMode = "decimal",
  placeholder,
  className,
  describedBy,
}: {
  id: string;
  value: number | null;
  rule: NumberRule;
  onValue: (value: number | null) => void;
  unit: ReactNode;
  /** The value in use, in words: "10 m", "unknown". */
  describe: (value: number | null) => string;
  step?: number;
  inputMode?: "decimal" | "numeric";
  placeholder?: string;
  className?: string;
  describedBy?: string;
}) {
  const [text, setText] = useState(show(value));
  const [shown, setShown] = useState(value);
  const [hint, setHint] = useState<string | null>(null);
  if (value !== shown) {
    setShown(value);
    setText(show(value));
    setHint(null);
  }
  const hintId = `${id}-hint`;

  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode={inputMode}
          min={rule.min}
          max={rule.max}
          step={step}
          placeholder={placeholder}
          className={className}
          value={text}
          aria-invalid={hint !== null || undefined}
          aria-describedby={cn(hint && hintId, describedBy) || undefined}
          onChange={(e) => {
            setText(e.target.value);
            const parsed = parseNumberInput(e.target.value, rule, e.target.validity.badInput);
            if (!parsed.ok) {
              setHint(parsed.hint);
              return;
            }
            setHint(null);
            setShown(parsed.value);
            onValue(parsed.value);
          }}
          onBlur={() => {
            if (hint === null) return;
            setText(show(value));
            setHint(null);
          }}
        />
        <span className="shrink-0 text-muted-foreground text-sm">{unit}</span>
      </div>
      {hint && (
        <p id={hintId} className="text-fail text-xs" data-testid="number-field-hint">
          {hint} Still using {describe(value)}.
        </p>
      )}
    </div>
  );
}
