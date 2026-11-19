"use client";

import { MAX_FAR_BONUS_PCT } from "@envelope/engine";
import { Input } from "@envelope/ui/components/input";
import { Label } from "@envelope/ui/components/label";
import { Switch } from "@envelope/ui/components/switch";
import { cn } from "@envelope/ui/lib/utils";
import { useId, useMemo } from "react";
import { usePlotStore } from "@/lib/plot/store";
import { formatArea, formatLength, formatNumber, formatRuleValue } from "@/lib/results/format";
import { groupRules, type RuleRow, TOGGLE_LABEL } from "@/lib/results/rule-groups";
import type { Scene } from "@/lib/results/scene";
import { summarise } from "@/lib/results/summary";
import { useResultsView } from "@/lib/results/view";
import { CitationLink, Figure, SectionTitle, StatusPill } from "./bits";
import { EnvelopeSwitch } from "./envelope-switch";

export function RulesTab({ scene }: { scene: Scene }) {
  const { result, input } = scene;
  const envelopeKind = useResultsView((s) => s.envelopeKind);
  const summary = summarise(input, result, envelopeKind);
  const groups = useMemo(
    () => groupRules(result.rules, result.highRise.checks),
    [result.rules, result.highRise.checks],
  );
  const far = summary.maxFloorArea;

  return (
    <div className="grid gap-6">
      <section aria-label="Summary" className="grid gap-4">
        <EnvelopeSwitch result={result} />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-lg border bg-card p-4">
          <Figure label="Plot area" value={formatArea(summary.plotAreaM2)} testId="sum-plot" />
          <Figure
            label="Max floor area"
            value={formatArea(far.areaM2)}
            testId="sum-max-gfa"
            detail={
              far.cappedAtM2 !== null
                ? `Capped at ${formatArea(far.cappedAtM2)}: the road is under 18 m`
                : `FAR ${formatNumber(far.far)} × plot area`
            }
          />
          <Figure
            label="Max height"
            value={summary.maxHeightM === null ? "No limit" : formatLength(summary.maxHeightM)}
            testId="sum-max-height"
            detail={
              summary.kind === "lowRise"
                ? "Low-rise: below 23 m"
                : summary.maxHeightM === null
                  ? "Height plane switched off"
                  : "Set by the road height plane"
            }
          />
          <Figure
            label="Ground area allowed"
            value={formatArea(summary.groundAreaM2)}
            testId="sum-ground-area"
            detail={`${Math.round((summary.groundAreaM2 / summary.plotAreaM2) * 100)}% of the plot`}
          />
        </dl>
      </section>

      {groups.map((group) => (
        <section key={group.id} aria-label={group.title} className="grid gap-2">
          <SectionTitle>{group.title}</SectionTitle>
          <ul className="grid divide-y rounded-lg border bg-card">
            {group.rows.map((row) => (
              <RuleRowItem key={row.key} row={row} />
            ))}
          </ul>
          {group.id === "floor-area" && <FarBonusInput value={input.farBonusPct} />}
        </section>
      ))}

      <p className="text-muted-foreground text-xs leading-relaxed">
        Not checked here: environmental impact (EIA) thresholds, setbacks from waterways, aviation
        height limits and the draft fourth revision of the Bangkok plan. Confirm with an architect
        before you buy or build.
      </p>
    </div>
  );
}

function RuleRowItem({ row }: { row: RuleRow }) {
  const { rule, toggle, check } = row;
  const toggles = usePlotStore((s) => s.settings.toggles);
  const switchId = useId();
  const off = !rule.enabled;

  return (
    <li
      className={cn("grid gap-1.5 px-3 py-2.5", off && "bg-muted/50")}
      data-testid={`rule-${rule.id}`}
      data-enabled={rule.enabled}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn("font-medium text-sm", off && "text-muted-foreground")}>{rule.label}</p>
        <p
          className={cn(
            "shrink-0 font-mono font-semibold text-sm tabular",
            off && "text-muted-foreground line-through",
          )}
        >
          {formatRuleValue(rule)}
        </p>
      </div>
      {rule.note && <p className="text-muted-foreground text-xs leading-snug">{rule.note}</p>}
      {check && (
        <p className="flex items-start gap-2 text-xs leading-snug">
          <StatusPill status={check.status} />
          <span className="pt-0.5">{check.message}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CitationLink source={rule.source} />
        {off && !toggle?.shown && (
          <span className="font-medium text-warn text-xs">Switched off</span>
        )}
        {toggle?.shown && (
          <div className="flex items-center gap-2">
            <Label
              htmlFor={switchId}
              className={cn("font-normal text-xs", off ? "text-warn" : "text-muted-foreground")}
            >
              {off ? "Switched off" : "Applied"}
            </Label>
            <Switch
              id={switchId}
              size="sm"
              checked={toggles[toggle.key]}
              aria-label={`Apply: ${TOGGLE_LABEL[toggle.key]}`}
              onCheckedChange={(on) => usePlotStore.getState().setToggle(toggle.key, on)}
            />
          </div>
        )}
      </div>
    </li>
  );
}

function FarBonusInput({ value }: { value: number }) {
  const id = useId();
  return (
    <div className="grid gap-1.5 rounded-lg border border-dashed p-3">
      <Label htmlFor={id} className="text-sm">
        Floor area bonus claimed
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          max={MAX_FAR_BONUS_PCT}
          step={1}
          className="w-24"
          value={value}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (e.target.value !== "" && Number.isFinite(next)) {
              usePlotStore.getState().setFarBonus(next);
            }
          }}
        />
        <span className="text-muted-foreground text-sm">% of base FAR (0–{MAX_FAR_BONUS_PCT})</span>
      </div>
      <p className="text-muted-foreground text-xs">
        Earned with affordable housing, a public park, park-and-ride near a station, rainwater
        retention or a green building.
      </p>
    </div>
  );
}
