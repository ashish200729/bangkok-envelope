"use client";

import { useEffect } from "react";
import { type EngineState, startEngine, useEngineStore } from "./store";

/** Live engine state for the current plot: idle, computing (with the previous result), ready or invalid. */
export function useEngineResult(): EngineState {
  useEffect(() => {
    startEngine();
  }, []);
  return useEngineStore((s) => s.state);
}
