import type { CustomDesignId, EngineInput, EngineResult } from "@envelope/engine";
import { create } from "zustand";
import { toEngineInput } from "@/lib/plot/engine-input";
import { usePlotStore } from "@/lib/plot/store";
import {
  type CustomBuilds,
  type CustomDelivery,
  type CustomJob,
  createCustomBuilds,
} from "./custom-builds";
import type { EngineReply } from "./protocol";
import { createEngineRunner, type EngineBackend } from "./runner";
import { createLatestWins } from "./scheduler";

/** A result together with the input it was computed from. */
export type Computed = { result: EngineResult; input: EngineInput };

export type EngineState =
  | { status: "idle" }
  | { status: "computing"; previous: Computed | null }
  | { status: "ready"; result: EngineResult; input: EngineInput }
  | { status: "invalid"; problems: string[] };

type EngineStore = {
  state: EngineState;
  backend: EngineBackend | null;
  lastMs: number | null;
};

export const useEngineStore = create<EngineStore>()(() => ({
  state: { status: "idle" },
  backend: null,
  lastMs: null,
}));

/** The newest finished result, also while a newer one is computing. */
export function latestComputed(state: EngineState): Computed | null {
  if (state.status === "ready") return { result: state.result, input: state.input };
  if (state.status === "computing") return state.previous;
  return null;
}

type Job = { input: EngineInput };
type Outcome = { input: EngineInput; reply: EngineReply };

let stop: (() => void) | null = null;
let customBuilds: CustomBuilds | null = null;
const customListeners = new Set<(delivery: CustomDelivery) => void>();

/** Builds an edited design in the engine worker; the newest edit of each design wins. */
export function submitCustomBuild(job: CustomJob) {
  startEngine();
  customBuilds?.submit(job);
}

export function forgetCustomBuild(id: CustomDesignId) {
  customBuilds?.forget(id);
}

/** Hears every edited-design build as it lands. Returns the unsubscribe. */
export function onCustomBuild(listener: (delivery: CustomDelivery) => void): () => void {
  customListeners.add(listener);
  return () => customListeners.delete(listener);
}

/** Starts evaluating the plot store's input on every change. Idempotent; browser only. */
export function startEngine(): () => void {
  if (stop) return stop;
  const runner = createEngineRunner();
  const set = useEngineStore.setState;
  set({ backend: runner.backend() });
  const builds = createCustomBuilds(
    (job) => runner.buildCustom(job.input, job.spec, job.id),
    (delivery) => {
      for (const listener of customListeners) listener(delivery);
    },
  );
  customBuilds = builds;

  const scheduler = createLatestWins<Job, Outcome>(
    async ({ input }) => ({ input, reply: await runner.run(input) }),
    ({ value, latest }) => {
      const { input, reply } = value;
      if (reply.kind === "invalid") {
        set({ state: { status: "invalid", problems: reply.problems } });
        return;
      }
      const computed = { result: reply.result, input };
      set({
        state: latest
          ? { status: "ready", ...computed }
          : { status: "computing", previous: computed },
        backend: runner.backend(),
        lastMs: reply.ms,
      });
    },
  );

  function submit() {
    const plot = usePlotStore.getState();
    if (plot.mode === "draw") {
      scheduler.cancel();
      set({ state: { status: "idle" } });
      return;
    }
    const check = toEngineInput(plot.draft, plot.roads, plot.settings);
    if (!check.ok) {
      scheduler.cancel();
      set({ state: { status: "invalid", problems: check.problems } });
      return;
    }
    const current = useEngineStore.getState().state;
    set({ state: { status: "computing", previous: latestComputed(current) } });
    scheduler.submit({ input: check.input });
  }

  const unsubscribe = usePlotStore.subscribe((s, prev) => {
    if (
      s.draft !== prev.draft ||
      s.roads !== prev.roads ||
      s.settings !== prev.settings ||
      s.mode !== prev.mode
    ) {
      submit();
    }
  });
  submit();

  stop = () => {
    unsubscribe();
    scheduler.dispose();
    builds.dispose();
    customBuilds = null;
    runner.dispose();
    stop = null;
  };
  return stop;
}
