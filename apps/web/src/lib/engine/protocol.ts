import type { EngineResult } from "@envelope/engine";

export type EngineReply =
  | { kind: "result"; result: EngineResult; ms: number }
  | { kind: "invalid"; problems: string[] };

export type WorkerRequest = { id: number; input: unknown };
export type WorkerResponse = { id: number; reply: EngineReply };
