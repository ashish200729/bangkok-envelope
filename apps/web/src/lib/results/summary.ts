import {
  ENVELOPE_CEILING_M,
  type EngineInput,
  type EngineSuccess,
  farLimit,
} from "@envelope/engine";
import { type EnvelopeKind, shownEnvelope } from "./view";

export type MaxFloorArea = {
  areaM2: number;
  far: number;
  /** Set when the high-rise 30,000 m² cap (road under 18 m) is lower than FAR × area. */
  cappedAtM2: number | null;
};

export function maxFloorArea(
  input: EngineInput,
  result: EngineSuccess,
  kind: EnvelopeKind,
): MaxFloorArea {
  const far = farLimit(input.zone, input.farBonusPct, kind === "highRise");
  const byFar = far * result.plotAreaM2;
  const cap = kind === "highRise" ? result.highRise.maxGfaM2 : null;
  if (cap !== null && cap < byFar) return { areaM2: cap, far, cappedAtM2: cap };
  return { areaM2: byFar, far, cappedAtM2: null };
}

export type Summary = {
  kind: EnvelopeKind;
  plotAreaM2: number;
  maxFloorArea: MaxFloorArea;
  /** Null when nothing but the computational ceiling stops the envelope. */
  maxHeightM: number | null;
  groundAreaM2: number;
};

export function summarise(
  input: EngineInput,
  result: EngineSuccess,
  preferred: EnvelopeKind,
): Summary {
  const { kind, envelope } = shownEnvelope(result, preferred);
  return {
    kind,
    plotAreaM2: result.plotAreaM2,
    maxFloorArea: maxFloorArea(input, result, kind),
    maxHeightM: envelope.maxHeightM >= ENVELOPE_CEILING_M ? null : envelope.maxHeightM,
    groundAreaM2: envelope.groundAreaM2,
  };
}
