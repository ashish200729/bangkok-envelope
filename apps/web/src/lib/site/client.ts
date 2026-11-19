import type { PlotContext } from "@envelope/db/site";
import type { LngLat } from "@envelope/engine";
import { api } from "@/lib/api";
import type { NoSiteData } from "./request";

export const SITE_ERROR_MESSAGE =
  "Couldn't load site data. Your plot still works; mark roads by hand.";

export type PlotContextResult =
  | { kind: "inside"; context: PlotContext }
  | { kind: "no-data"; reason: NoSiteData }
  | { kind: "failed"; message: string }
  | { kind: "aborted" };

/** API error codes that mean "no site data for this plot", not a failure worth retrying. */
const NO_DATA_CODES: Readonly<Record<string, NoSiteData>> = { plot_too_large: "too-large" };

async function errorCode(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
}

export async function fetchPlotContext(
  vertices: readonly LngLat[],
  signal: AbortSignal,
): Promise<PlotContextResult> {
  try {
    const res = await api.site["plot-context"].$post(
      { json: { vertices: vertices.map(([lng, lat]) => [lng, lat] as [number, number]) } },
      { init: { signal } },
    );
    if (!res.ok) {
      const reason = NO_DATA_CODES[(await errorCode(res)) ?? ""];
      return reason ? { kind: "no-data", reason } : { kind: "failed", message: SITE_ERROR_MESSAGE };
    }
    const body = await res.json();
    if ("error" in body) return { kind: "failed", message: SITE_ERROR_MESSAGE };
    if (!body.insideStudyArea) return { kind: "no-data", reason: "outside-area" };
    const { insideStudyArea: _inside, ...context } = body;
    return { kind: "inside", context };
  } catch {
    if (signal.aborted) return { kind: "aborted" };
    return { kind: "failed", message: SITE_ERROR_MESSAGE };
  }
}

export type StudyArea = {
  name: string;
  outline: [number, number][];
  attribution: string;
  license: string;
  licenseUrl: string;
  /** OSM base date of the snapshot (or its fetch date), as an ISO string. */
  dataAsOf: string | null;
};

let studyArea: Promise<StudyArea> | null = null;

/** The study area and its attribution; fetched once per page, again only after a failure. */
export function getStudyArea(): Promise<StudyArea> {
  studyArea ??= loadStudyArea().catch((error: unknown) => {
    studyArea = null;
    throw error;
  });
  return studyArea;
}

async function loadStudyArea(): Promise<StudyArea> {
  const res = await api.site.area.$get();
  if (!res.ok) throw new Error(`Study area request failed (${res.status})`);
  const body = await res.json();
  return {
    name: body.name,
    outline: body.geometry.coordinates[0] ?? [],
    attribution: body.attribution,
    license: body.license,
    licenseUrl: body.licenseUrl,
    dataAsOf: body.data ? (body.data.osmBaseAt ?? body.data.fetchedAt) : null,
  };
}
