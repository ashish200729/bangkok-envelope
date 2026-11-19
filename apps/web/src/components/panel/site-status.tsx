"use client";

import { Button } from "@envelope/ui/components/button";
import { CircleAlert, Info, RotateCcw } from "lucide-react";
import type { NoSiteData } from "@/lib/site/request";
import { useSiteStore } from "@/lib/site/store";
import { useStudyArea } from "@/lib/site/use-suggestions";

export const NO_SITE_DATA_NOTICE: Record<NoSiteData, string> = {
  "outside-area":
    "Site data covers Asok–Sukhumvit (about 3 × 2.7 km). Outside it, mark roads and the station distance yourself.",
  "too-large":
    "Roads and stations are looked up only for plots within about 500 m. Mark roads and the station distance yourself, or draw a smaller plot.",
};

/** Notices for plots without site data, and for errors. Silent while things work. */
export function SiteStatus() {
  const request = useSiteStore((s) => s.request);
  if (request.status === "no-data") {
    return (
      <p
        className="flex items-start gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm"
        data-testid="site-status"
      >
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>{NO_SITE_DATA_NOTICE[request.reason]}</span>
      </p>
    );
  }
  if (request.status === "error") {
    return (
      <div
        className="flex items-start justify-between gap-3 rounded-md border border-warn/40 px-3 py-2 text-sm"
        data-testid="site-status"
        role="status"
      >
        <p className="flex items-start gap-2">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <span>{request.message}</span>
        </p>
        <Button variant="outline" size="xs" onClick={() => useSiteStore.getState().retry()}>
          <RotateCcw /> Retry
        </Button>
      </div>
    );
  }
  return null;
}

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function SiteAttribution() {
  const state = useStudyArea();
  if (state.status !== "ready") return null;
  const { area } = state;
  return (
    <p className="text-muted-foreground text-xs" data-testid="site-attribution">
      Roads, buildings and stations:{" "}
      <a
        href={area.licenseUrl}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        {area.attribution}, ODbL
      </a>
      {area.dataAsOf ? ` · data as of ${DATE.format(new Date(area.dataAsOf))}` : ""}
    </p>
  );
}
