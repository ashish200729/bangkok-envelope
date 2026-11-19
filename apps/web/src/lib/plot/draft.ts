import type { LngLat } from "@envelope/engine";

export type VertexId = string & { readonly __brand: "VertexId" };

export type DraftVertex = { id: VertexId; lngLat: LngLat };

/** What a side of the plot faces. A side is identified by the vertex it starts at. */
export type SideRole = { kind: "boundary" } | { kind: "road"; roadId: string };

/**
 * The plot as the UI edits it. Vertices carry stable ids because Terra Draw reports only
 * coordinates; ids let a side keep its role when corners are dragged, inserted or deleted.
 */
export type PlotDraft = {
  vertices: readonly DraftVertex[];
  /** Keyed by the id of the side's starting vertex. Missing means boundary. */
  sides: Readonly<Record<VertexId, SideRole>>;
};

export type NewId = () => VertexId;

const BOUNDARY: SideRole = { kind: "boundary" };
/** About 1 mm at Bangkok's latitude; Terra Draw rounds coordinates to 9 decimals. */
const EPSILON_DEG = 1e-8;

export function sameLngLat(a: LngLat, b: LngLat): boolean {
  return Math.abs(a[0] - b[0]) < EPSILON_DEG && Math.abs(a[1] - b[1]) < EPSILON_DEG;
}

/** Drops the repeated closing position of a GeoJSON ring. */
export function openRing(ring: readonly LngLat[]): LngLat[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 1 && first && last && sameLngLat(first, last)) return ring.slice(0, -1);
  return [...ring];
}

export function sideRole(draft: PlotDraft, id: VertexId): SideRole {
  return draft.sides[id] ?? BOUNDARY;
}

export function draftFromRing(coords: readonly LngLat[], newId: NewId): PlotDraft {
  return { vertices: coords.map((lngLat) => ({ id: newId(), lngLat })), sides: {} };
}

/** Index k such that removing longer[k] leaves shorter, or -1. */
function removedIndex(longer: readonly LngLat[], shorter: readonly LngLat[]): number {
  for (let k = 0; k < longer.length; k++) {
    let match = true;
    for (let i = 0; i < shorter.length; i++) {
      const a = shorter[i];
      const b = longer[i < k ? i : i + 1];
      if (!a || !b || !sameLngLat(a, b)) {
        match = false;
        break;
      }
    }
    if (match) return k;
  }
  return -1;
}

/**
 * Maps a new coordinate list from the drawing tool onto the existing draft, keeping vertex ids
 * and side roles where the edit allows:
 * - same length (a corner or the whole plot moved): ids kept by position
 * - one corner inserted: both halves of the split side keep its role
 * - one corner deleted: the merged side is a road if either side was
 * - anything else: treated as a new plot, every side a boundary
 */
export function reconcileVertices(
  prev: PlotDraft,
  next: readonly LngLat[],
  newId: NewId,
): PlotDraft {
  const coords = openRing(next);
  const old = prev.vertices;
  const n = old.length;

  if (coords.length === n) {
    return {
      ...prev,
      vertices: old.map((v, i) => ({ id: v.id, lngLat: coords[i] ?? v.lngLat })),
    };
  }

  if (coords.length === n + 1) {
    const k = removedIndex(
      coords,
      old.map((v) => v.lngLat),
    );
    const inserted = coords[k];
    const before = old[(k - 1 + n) % n];
    if (k >= 0 && inserted && before) {
      const id = newId();
      const vertices = [...old.slice(0, k), { id, lngLat: inserted }, ...old.slice(k)];
      return { vertices, sides: { ...prev.sides, [id]: sideRole(prev, before.id) } };
    }
  }

  if (coords.length === n - 1 && coords.length >= 3) {
    const k = removedIndex(
      old.map((v) => v.lngLat),
      coords,
    );
    const removed = old[k];
    const before = old[(k - 1 + n) % n];
    if (k >= 0 && removed && before) {
      const kept = sideRole(prev, before.id);
      const dropped = sideRole(prev, removed.id);
      const merged = kept.kind === "road" ? kept : dropped;
      const { [removed.id]: _gone, ...rest } = prev.sides;
      return {
        vertices: old.filter((_, i) => i !== k),
        sides: { ...rest, [before.id]: merged },
      };
    }
  }

  return draftFromRing(coords, newId);
}
