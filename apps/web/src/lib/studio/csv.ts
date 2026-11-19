import { USE_LABEL } from "@envelope/engine";
import { scheduleAreasM2, sumFloorAreas } from "@/lib/results/designs";
import type { AnyDesign } from "@/lib/results/view";

/** One RFC 4180 field: quoted when it holds a comma, quote or line break. */
export function csvField(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const csvRow = (fields: readonly (string | number)[]) => fields.map(csvField).join(",");

const metres = (m: number) => (Math.round(m * 100) / 100).toFixed(2);

/**
 * The floor schedule, ground floor first. Areas are whole square metres that add up to the total
 * row (the same rounding as the panel), so a spreadsheet sum matches it.
 */
export function floorScheduleCsv(design: AnyDesign): string {
  const areas = scheduleAreasM2(design);
  const plates = design.spec.floors.length === design.floors.length ? design.spec.floors : null;
  const header = [
    "Floor",
    "Use",
    "Bottom (m)",
    "Top (m)",
    "Floor to floor (m)",
    "Floor area (m²)",
    "Plate",
    "Inset (m)",
  ];
  const rows = design.floors.map((floor, i) => {
    const spec = plates?.[i];
    return [
      floor.level + 1,
      USE_LABEL[floor.use],
      metres(floor.z0M),
      metres(floor.z0M + floor.heightM),
      metres(floor.heightM),
      areas[i] ?? 0,
      spec ? (spec.plate === "tower" ? "Tower" : "Envelope") : "",
      spec ? metres(spec.insetM) : "",
    ];
  });
  const total = ["Total", "", "", metres(design.heightM), "", Math.round(sumFloorAreas(design))];
  return `${[header, ...rows, total].map(csvRow).join("\r\n")}\r\n`;
}

/** A safe file name from a design name: "B1 Podium + tower" → "b1-podium-tower-floors.csv". */
export function scheduleFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${slug || "design"}-floors.csv`;
}

/** Saves text as a file through a Blob URL (allowed by the CSP: no network, no new origin). */
export function downloadText(text: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
