import type {
  CustomReply,
  EngineReply,
  EngineRequest,
  ReplyFor,
  WorkerRequest,
  WorkerResponse,
} from "./protocol";

export type EngineBackend = "worker" | "main-thread";

export type EngineRunner = {
  run: (input: unknown) => Promise<EngineReply>;
  buildCustom: (input: unknown, spec: unknown, designId: unknown) => Promise<CustomReply>;
  backend: () => EngineBackend;
  dispose: () => void;
};

type Reply = EngineReply | CustomReply;

async function runOnMainThread(request: EngineRequest): Promise<Reply> {
  const { handleRequest } = await import("./handle");
  return handleRequest(request);
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
  const waiting = new Map<number, { request: EngineRequest; resolve: (reply: Reply) => void }>();

  function fallBack(reason: unknown) {
    console.warn("engine: worker failed, evaluating on the main thread", reason);
    worker?.terminate();
    worker = null;
    for (const { request, resolve } of waiting.values()) {
      void runOnMainThread(request).then(resolve);
    }
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

  function send<R extends EngineRequest>(request: R): Promise<ReplyFor<R>> {
    const target = worker;
    if (!target) return runOnMainThread(request) as Promise<ReplyFor<R>>;
    nextId += 1;
    const id = nextId;
    return new Promise((resolve) => {
      waiting.set(id, { request, resolve: resolve as (reply: Reply) => void });
      const message: WorkerRequest = { id, request };
      target.postMessage(message);
    });
  }

  return {
    run: (input) => send({ kind: "evaluate", input }),
    buildCustom: (input, spec, designId) => send({ kind: "build-custom", input, spec, designId }),
    backend: () => (worker ? "worker" : "main-thread"),
    dispose() {
      worker?.terminate();
      worker = null;
      waiting.clear();
    },
  };
}
