import type { CustomDesign, EngineInput } from "@envelope/engine";
import {
  forgetCustomBuild,
  latestComputed,
  onCustomBuild,
  submitCustomBuild,
  useEngineStore,
} from "@/lib/engine/store";
import type { PlotDraft } from "@/lib/plot/draft";
import { usePlotStore } from "@/lib/plot/store";
import { useResultsView } from "@/lib/results/view";
import { EMPTY_SELECTION } from "./floors";
import { browserStorage, loadVariants, plotKey, saveVariants } from "./persist";
import { markBuilding, useStudio, variantById } from "./store";
import type { Variant } from "./variant";

const keyOf = (draft: PlotDraft) => plotKey(draft.vertices.map((v) => v.lngLat));

/** The input of the newest successful evaluation: what variants are built against. */
function currentInput(): EngineInput | null {
  const computed = latestComputed(useEngineStore.getState().state);
  return computed?.result.ok ? computed.input : null;
}

function build(variant: Variant, input: EngineInput) {
  markBuilding(variant.id);
  submitCustomBuild({ id: variant.id, input, spec: variant.history.present });
}

function mirrorDesigns() {
  const { variants, builds } = useStudio.getState();
  const designs = variants
    .map((v) => builds[v.id]?.design)
    .filter((d): d is CustomDesign => Boolean(d));
  const shown = useResultsView.getState().customDesigns;
  if (designs.length === shown.length && designs.every((d, i) => d === shown[i])) return;
  useResultsView.getState().setCustomDesigns(designs);
}

let stop: (() => void) | null = null;

/**
 * Connects the studio to the rest of the app: loads and saves variants per plot, rebuilds a
 * variant when it is edited or when the plot's evaluation changes, and hands built variants to
 * the view store the map follows. Idempotent; browser only.
 */
export function startStudio(): () => void {
  if (stop) return stop;
  const storage = browserStorage();
  let key = keyOf(usePlotStore.getState().draft);
  let movedFrom: string | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    saveVariants(storage, key, useStudio.getState().variants, { movedFrom });
    movedFrom = undefined;
  };
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 250);
  };

  // Builds and mirroring follow from the studio subscription below.
  const load = () => {
    const variants = loadVariants(storage, key);
    const view = useResultsView.getState();
    if (view.selectedDesign?.startsWith("custom-") && !variantById(variants, view.selectedDesign)) {
      view.selectDesign(null);
    }
    useStudio.getState().replaceVariants(variants);
  };

  let lastInput = currentInput();
  const offEngine = useEngineStore.subscribe(() => {
    const input = currentInput();
    if (!input || input === lastInput) return;
    lastInput = input;
    for (const v of useStudio.getState().variants) build(v, input);
  });

  const offStudio = useStudio.subscribe((s, prev) => {
    if (s.variants !== prev.variants) {
      const input = currentInput();
      const before = new Map(prev.variants.map((v) => [v.id, v]));
      for (const v of s.variants) {
        const old = before.get(v.id);
        if (input && old?.history.present !== v.history.present) build(v, input);
        before.delete(v.id);
      }
      for (const gone of before.keys()) forgetCustomBuild(gone);
      scheduleSave();
      const view = useResultsView.getState();
      const shown = variantById(s.variants, view.selectedDesign);
      if (shown && shown.history.present.envelope !== view.envelopeKind) {
        view.setEnvelopeKind(shown.history.present.envelope);
      }
    }
    if (s.variants !== prev.variants || s.builds !== prev.builds) mirrorDesigns();
    if (s.selection !== prev.selection) {
      const view = useResultsView.getState();
      const level = s.selection.anchor ?? s.selection.levels[0] ?? null;
      if (variantById(s.variants, view.selectedDesign) && level !== view.selectedFloor) {
        view.setSelectedFloor(level);
      }
    }
  });

  const offView = useResultsView.subscribe((v, prev) => {
    if (v.selectedDesign !== prev.selectedDesign) {
      useStudio.getState().setSelection(EMPTY_SELECTION);
      return;
    }
    if (v.selectedFloor !== prev.selectedFloor && v.selectedFloor !== null) {
      const { selection, variants } = useStudio.getState();
      if (variantById(variants, v.selectedDesign) && !selection.levels.includes(v.selectedFloor)) {
        useStudio.getState().setSelection({ levels: [v.selectedFloor], anchor: v.selectedFloor });
      }
    }
  });

  const offBuilds = onCustomBuild((delivery) => useStudio.getState().receiveBuild(delivery));

  const offPlot = usePlotStore.subscribe((s, prev) => {
    const newPlot =
      (prev.mode === "draw" && s.mode === "edit") || s.geometryRevision !== prev.geometryRevision;
    if (!newPlot && s.draft.vertices === prev.draft.vertices) return;
    const next = keyOf(s.draft);
    if (newPlot) {
      flush();
      key = next;
      load();
      return;
    }
    if (next === key) return;
    movedFrom ??= key;
    key = next;
    scheduleSave();
  });

  const onHide = () => flush();
  window.addEventListener("pagehide", onHide);
  load();

  stop = () => {
    flush();
    offEngine();
    offStudio();
    offView();
    offBuilds();
    offPlot();
    window.removeEventListener("pagehide", onHide);
    stop = null;
  };
  return stop;
}
