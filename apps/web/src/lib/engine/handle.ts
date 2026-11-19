import "./zod-jitless";
import { engineInputSchema, evaluate } from "@envelope/engine";
import type { EngineReply } from "./protocol";

/** Validates an input that crossed a boundary, then evaluates it. Shared by the worker and the fallback. */
export function handleRequest(input: unknown): EngineReply {
  const parsed = engineInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", problems: parsed.error.issues.map((issue) => issue.message) };
  }
  const started = performance.now();
  const result = evaluate(parsed.data);
  return { kind: "result", result, ms: performance.now() - started };
}
