"use client";

import type { LngLat } from "@envelope/engine";
import type { ReactNode } from "react";
import { buildingCount, type Clearance } from "@/lib/plot/clearance";
import { sameLngLat } from "@/lib/plot/draft";
import { formatM, formatM2, formatThaiLandArea } from "@/lib/plot/format";
import { areaM2, interiorAnglesDeg, perimeterM } from "@/lib/plot/geometry";
import { type DrawProgress, drawOutline, SHARP_ANGLE_DEG } from "./measure-layers";

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="font-mono font-medium tabular">{children}</span>
    </div>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border bg-muted px-1 font-mono text-[11px] text-foreground">
      {children}
    </kbd>
  );
}

export function buildingsText(n: number) {
  return `${n} existing ${n === 1 ? "building" : "buildings"}`;
}

function corners(n: number) {
  return `${n} ${n === 1 ? "corner" : "corners"}`;
}

/** What a screen reader hears: it changes only when a corner is placed or removed. */
function announcement(placed: readonly LngLat[]) {
  if (placed.length === 0)
    return "Drawing a new plot. Click on the map to place each corner, then click the first corner or press Enter to finish. Escape cancels; Backspace removes the last corner.";
  const parts = [`${corners(placed.length)} placed.`];
  if (placed.length >= 2) parts.push(`Sides so far ${formatM(perimeterM(placed, false))}.`);
  if (placed.length >= 3) parts.push(`Area if closed ${formatM2(areaM2(placed))}.`);
  return parts.join(" ");
}

/** Figures and keyboard hints shown over the map while a plot is drawn. */
export function DrawHud({
  progress,
  covering,
}: {
  progress: DrawProgress;
  /** Existing buildings under the outline so far, in red on the map. */
  covering: Clearance | null;
}) {
  const { placed, cursor } = progress;
  const n = placed.length;
  const outline = drawOutline(progress);
  const first = placed[0];
  const closing = n >= 3 && cursor !== null && first !== undefined && sameLngLat(cursor, first);
  const area = n >= 3 ? areaM2(outline) : null;
  const sharp =
    n >= 3 &&
    interiorAnglesDeg(outline)
      .slice(0, n)
      .some((angle) => angle < SHARP_ANGLE_DEG);

  return (
    <div
      role="status"
      data-testid="draw-hud"
      className="absolute top-14 right-13 left-3 grid gap-1.5 rounded-lg border bg-background/95 px-3 py-2 text-sm shadow-md backdrop-blur-sm sm:top-3 sm:right-auto sm:left-1/2 sm:max-w-[min(36rem,calc(100%-7rem))] sm:-translate-x-1/2"
    >
      <p className="sr-only">{announcement(placed)}</p>
      {n === 0 ? (
        <p className="font-medium">Click to place each corner.</p>
      ) : (
        <div aria-hidden className="flex flex-wrap items-end gap-x-4 gap-y-1 sm:gap-x-5">
          <Figure label="Corners">{n}</Figure>
          {n >= 2 && <Figure label="Perimeter">{formatM(perimeterM(outline))}</Figure>}
          {area !== null && (
            <Figure label="Area">
              {formatM2(area)}{" "}
              <span className="font-sans font-normal text-muted-foreground text-xs">
                {formatThaiLandArea(area)}
              </span>
            </Figure>
          )}
        </div>
      )}
      {covering && n >= 2 && (
        <p className="flex items-center gap-1.5 text-fail text-xs" data-testid="draw-covering">
          <span aria-hidden className="size-2 rounded-[2px] bg-fail" />
          Covers {buildingsText(buildingCount(covering))} ({formatM2(covering.groundM2)} of ground).
          You will be asked to confirm they are demolished.
        </p>
      )}
      {sharp && (
        <p aria-hidden className="text-warn text-xs">
          A corner is sharper than {SHARP_ANGLE_DEG}°. Check the corners are in order.
        </p>
      )}
      <ul
        aria-hidden
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs sm:gap-x-1.5 sm:[&>li+li]:before:mr-1.5 sm:[&>li+li]:before:content-['·']"
      >
        {closing ? (
          <li className="font-medium text-foreground">Click to finish the plot</li>
        ) : (
          n >= 3 && <li>Click the first corner to finish</li>
        )}
        {n >= 3 && (
          <li className="pointer-coarse:hidden">
            <Key>Enter</Key> finishes
          </li>
        )}
        <li className="pointer-coarse:hidden">
          <Key>Esc</Key> cancels
        </li>
        {n > 0 && (
          <li className="pointer-coarse:hidden">
            <Key>Backspace</Key> removes the last corner
          </li>
        )}
      </ul>
    </div>
  );
}
