import type { CustomDesignResult, EngineResult } from "@envelope/engine";

export type EngineReply =
  | { kind: "result"; result: EngineResult; ms: number }
  | { kind: "invalid"; problems: string[] };

export type CustomReply =
  | {
      kind: "custom";
      result: CustomDesignResult;
      /** Levels with floor area outside the envelope (only measured when the check fails). */
      breaches: number[];
      ms: number;
    }
  | { kind: "invalid"; problems: string[] };

/** What crosses into the worker. Every field is unknown until `handle.ts` validates it. */
export type EngineRequest =
  | { kind: "evaluate"; input: unknown }
  | { kind: "build-custom"; input: unknown; spec: unknown; designId: unknown };

export type ReplyFor<R extends EngineRequest> = R extends { kind: "evaluate" }
  ? EngineReply
  : CustomReply;

/** Studio variant ids: `custom-` and a short lowercase random part. */
export const CUSTOM_ID_PATTERN = /^custom-[a-z0-9-]{1,64}$/;

export type WorkerRequest = { id: number; request: EngineRequest };
export type WorkerResponse = { id: number; reply: EngineReply | CustomReply };
