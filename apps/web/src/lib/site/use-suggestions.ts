"use client";

import { useEffect, useMemo, useState } from "react";
import { usePlotStore } from "@/lib/plot/store";
import { getStudyArea, type StudyArea } from "./client";
import { currentContext } from "./request";
import { useSiteStore } from "./store";
import { roadSuggestions, sideSuggestions } from "./suggest";

export function useSiteSuggestions() {
  const draft = usePlotStore((s) => s.draft);
  const roads = usePlotStore((s) => s.roads);
  const request = useSiteStore((s) => s.request);
  return useMemo(() => {
    const matches = currentContext(request)?.matches ?? new Map();
    return {
      sides: sideSuggestions({ draft, roads }, matches),
      roads: roadSuggestions({ draft, roads }, matches),
    };
  }, [draft, roads, request]);
}

export type StudyAreaState =
  | { status: "loading" }
  | { status: "ready"; area: StudyArea }
  | { status: "failed" };

export function useStudyArea(): StudyAreaState {
  const [state, setState] = useState<StudyAreaState>({ status: "loading" });
  useEffect(() => {
    let live = true;
    getStudyArea().then(
      (area) => live && setState({ status: "ready", area }),
      () => live && setState({ status: "failed" }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}
