import { type DesignSpec, designSpecSchema, type LngLat } from "@envelope/engine";
import { z } from "zod";
import { CUSTOM_ID_PATTERN } from "@/lib/engine/protocol";
import { createHistory } from "./history";
import type { Variant } from "./variant";

/** Bump when the stored shape changes; older entries are then ignored. */
export const STORAGE_KEY = "envelope.studio.v1";
/** Plots remembered; the least recently saved are dropped first. */
export const MAX_PLOTS = 12;

/** Identifies a plot by its corners (to about 10 cm), so variants come back with it. */
export function plotKey(vertices: readonly LngLat[]): string {
  const text = vertices.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(";");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `p${(hash >>> 0).toString(36)}-${vertices.length}`;
}

const storedVariantSchema = z.object({
  id: z.string().regex(CUSTOM_ID_PATTERN),
  badge: z.string().min(1).max(8),
  source: z.object({
    id: z.string().min(1).max(80),
    name: z.string().max(80),
    badge: z.string().min(1).max(8),
  }),
  spec: z.unknown(),
  original: z.unknown(),
});

const storeSchema = z.object({
  plots: z.record(
    z.string(),
    z.object({ savedAt: z.number(), variants: z.array(z.unknown()).max(50) }),
  ),
});

type Stored = z.infer<typeof storeSchema>;
export type StoredVariant = {
  id: Variant["id"];
  badge: string;
  source: Variant["source"];
  spec: DesignSpec;
  original: DesignSpec;
};

function readStore(storage: Storage): Stored {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { plots: {} };
    const parsed = storeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : { plots: {} };
  } catch {
    return { plots: {} };
  }
}

/** Checks one stored variant; anything that fails its schema is dropped, not repaired. */
export function parseStoredVariant(value: unknown): StoredVariant | null {
  const meta = storedVariantSchema.safeParse(value);
  if (!meta.success) return null;
  const spec = designSpecSchema.safeParse(meta.data.spec);
  if (!spec.success) return null;
  const original = designSpecSchema.safeParse(meta.data.original);
  return {
    id: meta.data.id as Variant["id"],
    badge: meta.data.badge,
    source: meta.data.source as Variant["source"],
    spec: spec.data,
    original: original.success ? original.data : spec.data,
  };
}

/** The variants saved for a plot, valid ones only, each with a fresh history. */
export function loadVariants(storage: Storage | null, key: string): Variant[] {
  if (!storage) return [];
  const entry = readStore(storage).plots[key];
  if (!entry) return [];
  const seen = new Set<string>();
  const variants: Variant[] = [];
  for (const value of entry.variants) {
    const stored = parseStoredVariant(value);
    if (!stored || seen.has(stored.id)) continue;
    seen.add(stored.id);
    variants.push({
      id: stored.id,
      badge: stored.badge,
      source: stored.source,
      original: stored.original,
      history: createHistory(stored.spec),
    });
  }
  return variants;
}

export function toStored(variant: Variant): StoredVariant {
  return {
    id: variant.id,
    badge: variant.badge,
    source: variant.source,
    spec: variant.history.present,
    original: variant.original,
  };
}

/**
 * Saves a plot's variants (none removes the plot) and forgets the oldest plots past the cap.
 * `movedFrom` is the plot's key before it was reshaped; that entry is removed.
 */
export function saveVariants(
  storage: Storage | null,
  key: string,
  variants: readonly Variant[],
  { now = Date.now(), movedFrom }: { now?: number; movedFrom?: string } = {},
): boolean {
  if (!storage) return false;
  try {
    const store = readStore(storage);
    if (movedFrom !== undefined && movedFrom !== key) delete store.plots[movedFrom];
    if (variants.length === 0) delete store.plots[key];
    else store.plots[key] = { savedAt: now, variants: variants.map(toStored) };
    const keys = Object.entries(store.plots)
      .sort(([, a], [, b]) => b.savedAt - a.savedAt)
      .map(([k]) => k);
    for (const old of keys.slice(MAX_PLOTS)) delete store.plots[old];
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/** localStorage, or null where the browser refuses it (private mode, blocked site data). */
export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
