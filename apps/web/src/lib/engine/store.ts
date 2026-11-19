import type { EngineInput, EngineResult } from "@envelope/engine";
import { create } from "zustand";
import { toEngineInput } from "@/lib/plot/engine-input";
import { usePlotStore } from "@/lib/plot/store";
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

/** Starts evaluating the plot store's input on every change. Idempotent; browser only. */
export function startEngine(): () => void {
  if (stop) return stop;
  const runner = createEngineRunner();
  const set = useEngineStore.setState;
  set({ backend: runner.backend() });

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
    runner.dispose();
    stop = null;
  };
  return stop;
}
