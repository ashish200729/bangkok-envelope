"use client";

import { useMemo } from "react";
import { useAsBuilt } from "@/lib/scene/as-built";
import { type SiteHold, siteHold } from "./clearance";
import { usePlotStore } from "./store";

/** Whether results wait for the user to confirm the plot's existing buildings will go. */
export function useSiteHold(): SiteHold {
  const siteCheck = usePlotStore((s) => s.siteCheck);
  const demolitionConfirmed = usePlotStore((s) => s.demolitionConfirmed);
  const buildings = useAsBuilt((s) => s.buildings);
  return useMemo(
    () => siteHold({ siteCheck, demolitionConfirmed }, buildings),
    [siteCheck, demolitionConfirmed, buildings],
  );
}

/** The same, read once outside React (the map). */
export function currentSiteHold(): SiteHold {
  return siteHold(usePlotStore.getState(), useAsBuilt.getState().buildings);
}
