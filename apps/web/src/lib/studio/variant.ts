import type { CustomDesignId, DesignId, DesignSpec } from "@envelope/engine";
import type { AnyDesignId } from "@/lib/results/view";
import { createHistory, type History } from "./history";

/** The option a variant was made from, as it was named then. */
export type VariantSource = { id: AnyDesignId; name: string; badge: string };

/** A user's editable copy of an option. Its spec is `history.present`. */
export type Variant = {
  id: CustomDesignId;
  /** "B1": the source's letter and a number, shown in the card's badge. */
  badge: string;
  source: VariantSource;
  /** The spec it was made with, for "Reset" when the source option no longer exists. */
  original: DesignSpec;
  history: History;
};

export const GENERATED_BADGE: Record<DesignId, string> = {
  midrise: "A",
  "podium-tower": "B",
  stepped: "C",
};

export function newVariantId(): CustomDesignId {
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  return `custom-${random}`;
}

/** The next free badge for a variant of `letter`: B1, B2… */
export function nextBadge(letter: string, taken: readonly string[]): string {
  for (let n = 1; ; n++) {
    const badge = `${letter}${n}`;
    if (!taken.includes(badge)) return badge;
  }
}

export function makeVariant(
  source: VariantSource,
  spec: DesignSpec,
  taken: readonly string[],
  name?: string,
): Variant {
  const badge = nextBadge(source.badge.charAt(0), taken);
  const named = { ...spec, name: (name ?? `${source.name} · edited`).slice(0, 60) };
  return {
    id: newVariantId(),
    badge,
    source,
    original: named,
    history: createHistory(named),
  };
}
