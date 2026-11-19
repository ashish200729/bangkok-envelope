import "./zod-jitless";
import {
  buildCustomDesign,
  type CustomDesignId,
  type DesignSpec,
  designSpecSchema,
  type EngineInput,
  engineInputSchema,
  evaluate,
} from "@envelope/engine";
import {
  CUSTOM_ID_PATTERN,
  type CustomReply,
  type EngineReply,
  type EngineRequest,
} from "./protocol";

/** Validates an input that crossed a boundary, then evaluates it. Shared by the worker and the fallback. */
export function handleEvaluate(input: unknown): EngineReply {
  const parsed = engineInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", problems: parsed.error.issues.map((issue) => issue.message) };
  }
  const started = performance.now();
  const result = evaluate(parsed.data);
  return { kind: "result", result, ms: performance.now() - started };
}

const isCustomId = (id: unknown): id is CustomDesignId =>
  typeof id === "string" && CUSTOM_ID_PATTERN.test(id);

/** Floor area outside the envelope from the ground up to and including `level`. */
function outsideThrough(
  input: EngineInput,
  spec: DesignSpec,
  id: CustomDesignId,
  level: number,
): number {
  const built = buildCustomDesign(input, { ...spec, floors: spec.floors.slice(0, level + 1) }, id);
  if (!built.ok) return 0;
  const fit = built.design.checks.find((c) => c.ruleId === "envelope.fit" && c.actual !== null);
  return fit?.actual ?? 0;
}

const BREACH_M2 = 1;

/**
 * Which floors stick out of the envelope. Floors stack bottom-up and never depend on the floors
 * above, so the area outside through floor k only grows with k; halving the range finds the
 * floors where it grows without building every prefix.
 */
export function breachLevels(input: EngineInput, spec: DesignSpec, id: CustomDesignId): number[] {
  const found: number[] = [];
  const search = (lo: number, hi: number, atLo: number, atHi: number) => {
    if (atHi - atLo < BREACH_M2) return;
    if (hi === lo + 1) {
      found.push(hi);
      return;
    }
    const mid = Math.floor((lo + hi) / 2);
    const atMid = outsideThrough(input, spec, id, mid);
    search(lo, mid, atLo, atMid);
    search(mid, hi, atMid, atHi);
  };
  const top = spec.floors.length - 1;
  search(-1, top, 0, outsideThrough(input, spec, id, top));
  return found;
}

/** Validates an edited design's input, spec and id, then builds and checks it. */
export function handleBuildCustom(input: unknown, spec: unknown, designId: unknown): CustomReply {
  const parsedInput = engineInputSchema.safeParse(input);
  const parsedSpec = designSpecSchema.safeParse(spec);
  const problems = [
    ...(parsedInput.success ? [] : parsedInput.error.issues.map((i) => i.message)),
    ...(parsedSpec.success ? [] : parsedSpec.error.issues.map((i) => i.message)),
    ...(isCustomId(designId) ? [] : ["The design id is not a studio id"]),
  ];
  if (!parsedInput.success || !parsedSpec.success || !isCustomId(designId)) {
    return { kind: "invalid", problems };
  }
  const started = performance.now();
  const result = buildCustomDesign(parsedInput.data, parsedSpec.data, designId);
  const fails =
    result.ok &&
    result.design.checks.some(
      (c) => c.ruleId === "envelope.fit" && c.status === "fail" && c.actual !== null,
    );
  const breaches = fails ? breachLevels(parsedInput.data, parsedSpec.data, designId) : [];
  return { kind: "custom", result, breaches, ms: performance.now() - started };
}

export function handleRequest(request: EngineRequest): EngineReply | CustomReply {
  return request.kind === "evaluate"
    ? handleEvaluate(request.input)
    : handleBuildCustom(request.input, request.spec, request.designId);
}
