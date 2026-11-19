"use client";

import {
  DESIGN_ASSUMPTIONS,
  ENGINE_VERSION,
  FEASIBILITY_ASSUMPTIONS,
  formatTHB,
  ZONES,
} from "@envelope/engine";
import type * as React from "react";
import {
  formatArea,
  formatFar,
  formatInt,
  formatLength,
  formatPercent,
} from "@/lib/results/format";
import { useScene } from "@/lib/results/use-scene";
import {
  ASSUMPTION_LABEL,
  feasibilityOf,
  useFeasibility,
  verdictText,
} from "@/lib/studio/feasibility";
import { keyLabel } from "@/lib/studio/metrics";
import { NOTICE } from "../layout/top-bar";
import { Checklist } from "../results/checklist";
import { SectionPreview } from "../results/section-preview";

const PAGE_CSS = "@page { size: A4; margin: 14mm; }";

/** Paper is white: the light theme's tokens, even when the screen is dark. */
const LIGHT_TOKENS = {
  "--background": "oklch(1 0 0)",
  "--foreground": "oklch(0.21 0.012 60)",
  "--card": "oklch(1 0 0)",
  "--muted": "oklch(0.955 0.005 75)",
  "--muted-foreground": "oklch(0.45 0.012 60)",
  "--border": "oklch(0.86 0.006 75)",
  "--accent": "oklch(0.94 0.02 250)",
  "--primary": "oklch(0.45 0.13 252)",
  "--pass": "oklch(0.5 0.13 150)",
  "--fail": "oklch(0.52 0.2 27)",
  "--warn": "oklch(0.58 0.14 70)",
  "--envelope": "oklch(0.55 0.13 245)",
} as React.CSSProperties;

/**
 * The selected option on paper: figures, section, checklist with sources, cost and return,
 * the assumptions and the notice. Hidden on screen; the app is hidden in print.
 */
export function PrintSummary() {
  const { scene } = useScene();
  const values = useFeasibility((s) => s.values);
  const overrides = useFeasibility((s) => s.overrides);
  const design = scene?.design ?? null;
  if (!scene || !design) return null;
  const { input } = scene;
  const money = feasibilityOf(design, input, values);
  const keys = keyLabel(input.buildingType);
  const envelope =
    design.envelope === "highRise"
      ? (scene.result.envelopes.highRise ?? scene.result.envelopes.lowRise)
      : scene.result.envelopes.lowRise;
  const figures: [string, string][] = [
    ["Plot area", formatArea(scene.result.plotAreaM2)],
    ["Zone", `${ZONES[input.zone].labelTh} · ${ZONES[input.zone].name}`],
    ["Floor area", formatArea(design.gfaM2)],
    ["FAR used", formatFar(design.farUsed)],
    ["Height", `${formatLength(design.heightM)} · ${design.floors.length} storeys`],
    ["Open ground", `${formatArea(design.openSpaceM2)} (OSR ${formatPercent(design.osrUsed)})`],
    ...(keys ? ([[keys, formatInt(design.keyCount ?? 0)]] as [string, string][]) : []),
    [
      "Parking",
      `${formatInt(design.parking.providedSpaces)} of ${formatInt(design.parking.requiredSpaces)} required`,
    ],
    ["Rough cost (no land)", formatTHB(money.costs.totalTHB)],
    ["Value when built", formatTHB(money.value.grossDevelopmentValueTHB)],
    [
      "Income a year",
      money.value.incomePerYearTHB === null ? "–" : formatTHB(money.value.incomePerYearTHB),
    ],
    ["Left for land", formatTHB(money.leftForLandTHB)],
    ["Land at market price", formatTHB(money.landCostTHB)],
    ["Land verdict", verdictText(money, formatTHB)],
  ];

  return (
    <article
      className="hidden bg-white text-[11px] text-black leading-snug print:block"
      data-testid="print-summary"
      aria-hidden
      style={LIGHT_TOKENS}
    >
      <style>{PAGE_CSS}</style>
      <header className="mb-3 flex items-end justify-between border-black border-b pb-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider">
            Bangkok Plot Envelope · concept study
          </p>
          <h1 className="font-semibold text-xl">{design.name}</h1>
          <p>{design.summary}</p>
        </div>
        <p className="text-right text-[10px]">
          {new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          <br />
          Engine {ENGINE_VERSION}
        </p>
      </header>
      <p className="mb-3 rounded border border-black px-2 py-1 font-medium">{NOTICE}</p>
      <div className="mb-3 grid grid-cols-[1fr_1.1fr] gap-4">
        <table className="w-full" data-testid="print-figures">
          <tbody>
            {figures.map(([label, value]) => (
              <tr key={label} className="border-black/20 border-b">
                <th scope="row" className="py-0.5 pr-2 text-left font-normal">
                  {label}
                </th>
                <td className="py-0.5 text-right font-mono tabular">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <SectionPreview design={design} input={input} envelope={envelope} height={260} />
      </div>
      <h2 className="mb-1 font-semibold text-sm">Checklist</h2>
      <Checklist
        checks={design.checks}
        dense
        className="mb-3 rounded-none border-black/30 bg-white"
      />
      <h2 className="mb-1 font-semibold text-sm">Cost and return</h2>
      <ul className="mb-3 list-disc pl-4">
        {money.lines.map((line) => (
          <li key={line.text}>{line.text}</li>
        ))}
      </ul>
      <h2 className="mb-1 font-semibold text-sm">Assumptions</h2>
      <ul className="mb-3 grid gap-0.5">
        {Object.entries(DESIGN_ASSUMPTIONS).map(([key, a]) => (
          <li key={key}>
            <span className="font-medium">{key.replace(/([A-Z])/g, " $1").toLowerCase()}</span>:{" "}
            {typeof a.value === "object"
              ? JSON.stringify(a.value).replace(/[{}"]/g, "").replaceAll(",", ", ")
              : a.value}{" "}
            {a.unit} ({a.confidence}). {a.source}
          </li>
        ))}
        {(Object.keys(FEASIBILITY_ASSUMPTIONS) as (keyof typeof FEASIBILITY_ASSUMPTIONS)[]).map(
          (key) => (
            <li key={key}>
              <span className="font-medium">{ASSUMPTION_LABEL[key]}</span>: {values[key]}{" "}
              {FEASIBILITY_ASSUMPTIONS[key].unit} ({FEASIBILITY_ASSUMPTIONS[key].confidence}
              {overrides[key] !== undefined ? ", changed by you" : ""}).{" "}
              {FEASIBILITY_ASSUMPTIONS[key].source}
            </li>
          ),
        )}
      </ul>
      <p className="border-black border-t pt-2 text-[10px]">
        Rough concept-stage figures. Financing, selling costs and the time to sell are not modelled.
        Not checked: EIA approval, waterway setbacks, aviation height limits and the draft fourth
        revision of the Bangkok plan. {NOTICE}
      </p>
    </article>
  );
}
