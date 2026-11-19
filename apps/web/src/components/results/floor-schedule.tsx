"use client";

import { ChevronDown } from "lucide-react";
import { floorUseColor, scheduleAreasM2, sumFloorAreas } from "@/lib/results/designs";
import { FLOOR_USE_LABEL, floorNumber, formatArea, formatLength } from "@/lib/results/format";
import type { AnyDesign } from "@/lib/results/view";

/** The floor schedule, top floor first; whole m² that add up to the total shown. */
export function FloorSchedule({ design }: { design: AnyDesign }) {
  const total = sumFloorAreas(design);
  const areas = scheduleAreasM2(design);
  const topDown = design.floors.map((floor, i) => ({ floor, areaM2: areas[i] ?? 0 })).reverse();
  return (
    <details className="group border-t" data-testid="floor-schedule">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-3 font-medium text-sm focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        Floor schedule
        <span className="font-normal text-muted-foreground text-xs">
          {design.floors.length} floors · {formatArea(total)}
        </span>
        <ChevronDown
          aria-hidden
          className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="mb-4 max-h-80 overflow-y-auto rounded-lg border">
        <table className="w-full text-sm" data-testid={`schedule-${design.id}`}>
          <thead className="sticky top-0 bg-card text-muted-foreground text-xs">
            <tr className="border-b">
              <th scope="col" className="px-3 py-1.5 text-left font-normal">
                Floor
              </th>
              <th scope="col" className="px-3 py-1.5 text-left font-normal">
                Use
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-normal">
                Height
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-normal">
                Area
              </th>
            </tr>
          </thead>
          <tbody className="font-mono tabular">
            {topDown.map(({ floor, areaM2 }) => (
              <tr key={floor.level} className="border-b last:border-b-0">
                <td className="px-3 py-1">{floorNumber(floor.level)}</td>
                <td className="px-3 py-1 font-sans">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-2 rounded-sm"
                      style={{ background: floorUseColor(floor.use) }}
                    />
                    {FLOOR_USE_LABEL[floor.use]}
                  </span>
                </td>
                <td className="px-3 py-1 text-right">{formatLength(floor.heightM)}</td>
                <td className="px-3 py-1 text-right">{formatArea(areaM2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-card">
            <tr className="border-t font-semibold">
              <td colSpan={3} className="px-3 py-1.5">
                Total floor area
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular" data-testid="schedule-total">
                {formatArea(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </details>
  );
}
