import type { EngineReply, WorkerRequest, WorkerResponse } from "./protocol";

export type EngineBackend = "worker" | "main-thread";

export type EngineRunner = {
  run: (input: unknown) => Promise<EngineReply>;
  backend: () => EngineBackend;
  dispose: () => void;
};

async function runOnMainThread(input: unknown): Promise<EngineReply> {
  const { handleRequest } = await import("./handle");
  return handleRequest(input);
}

function createWorker(): Worker | null {
  try {
    return new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
  } catch (error) {
    console.warn("engine: Web Worker unavailable, evaluating on the main thread", error);
    return null;
  }
}

/** Evaluates in a Web Worker, or on the main thread when the worker cannot start or crashes. */
export function createEngineRunner(): EngineRunner {
  let worker = createWorker();
  let nextId = 0;
  const waiting = new Map<number, { input: unknown; resolve: (reply: EngineReply) => void }>();

  function fallBack(reason: unknown) {
    console.warn("engine: worker failed, evaluating on the main thread", reason);
    worker?.terminate();
    worker = null;
    for (const { input, resolve } of waiting.values()) void runOnMainThread(input).then(resolve);
    waiting.clear();
  }

  if (worker) {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const entry = waiting.get(event.data.id);
      if (!entry) return;
      waiting.delete(event.data.id);
      entry.resolve(event.data.reply);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fallBack(event.message);
    };
    worker.onmessageerror = (event) => fallBack(event);
  }

  return {
    run(input) {
      const target = worker;
      if (!target) return runOnMainThread(input);
      nextId += 1;
      const id = nextId;
      return new Promise((resolve) => {
        waiting.set(id, { input, resolve });
        const request: WorkerRequest = { id, input };
        target.postMessage(request);
      });
    },
    backend: () => (worker ? "worker" : "main-thread"),
    dispose() {
      worker?.terminate();
      worker = null;
      waiting.clear();
    },
  };
}
