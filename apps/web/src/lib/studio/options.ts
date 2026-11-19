import type { CustomDesignId, DesignId } from "@envelope/engine";
import type { AnyDesign, AnyDesignId } from "@/lib/results/view";
import { recommendedId } from "./metrics";
import type { BuildState } from "./store";
import { GENERATED_BADGE, type Variant } from "./variant";

/** One card in "Ways to build it": a generated option or a variant with its latest build. */
export type OptionEntry =
  | { kind: "generated"; id: DesignId; badge: string; design: AnyDesign }
  | {
      kind: "variant";
      id: CustomDesignId;
      badge: string;
      variant: Variant;
      design: AnyDesign | null;
      build: BuildState | undefined;
    };

export function optionEntries(
  generated: readonly AnyDesign[],
  variants: readonly Variant[],
  builds: Partial<Record<CustomDesignId, BuildState>>,
): OptionEntry[] {
  return [
    ...generated.map(
      (design): OptionEntry => ({
        kind: "generated",
        id: design.id as DesignId,
        badge: GENERATED_BADGE[design.id as DesignId] ?? "?",
        design,
      }),
    ),
    ...variants.map((variant): OptionEntry => {
      const build = builds[variant.id];
      return {
        kind: "variant",
        id: variant.id,
        badge: variant.badge,
        variant,
        design: build?.design ?? null,
        build,
      };
    }),
  ];
}

export function entryName(entry: OptionEntry): string {
  return entry.kind === "generated" ? entry.design.name : entry.variant.history.present.name;
}

export function recommendedEntry(entries: readonly OptionEntry[]): AnyDesignId | null {
  const designs = entries.flatMap((e) => (e.design ? [e.design] : []));
  return recommendedId(designs);
}

/** The option a variant is compared with: its source, as it is built now. */
export function baselineFor(
  variant: Variant,
  generated: readonly AnyDesign[],
  customDesigns: readonly AnyDesign[],
): AnyDesign | null {
  const id = variant.source.id;
  return generated.find((d) => d.id === id) ?? customDesigns.find((d) => d.id === id) ?? null;
}
