import "@/lib/engine/zod-jitless";
import {
  buildCustomDesign,
  type DesignSpec,
  evaluate,
  type FloorSpec,
  SAMPLE_INPUT,
} from "@envelope/engine";
import { beforeEach, describe, expect, it } from "vitest";
import { breachLevels, handleBuildCustom } from "@/lib/engine/handle";
import { scheduleAreasM2 } from "@/lib/results/designs";
import { csvField, floorScheduleCsv, scheduleFileName } from "./csv";
import {
  addAbove,
  clickSelect,
  describeLevels,
  duplicate,
  EMPTY_SELECTION,
  groupFloors,
  move,
  parseLevels,
  remove,
  selectByUse,
  setFloors,
} from "./floors";
import { applyEdit, canRedo, createHistory, endGesture, goTo, redo, undo } from "./history";
import { recommendedId } from "./metrics";
import { loadVariants, parseStoredVariant, plotKey, STORAGE_KEY, saveVariants } from "./persist";
import { layoutSection, sectionModel, spreadLabels } from "./section";
import { useStudio } from "./store";
import { makeVariant } from "./variant";

const result = evaluate(SAMPLE_INPUT);
if (!result.ok) throw new Error("sample plot must evaluate");
const tower = result.designs.find((d) => d.id === "podium-tower");
if (!tower) throw new Error("sample plot must have option B");
const SPEC: DesignSpec = tower.spec;

const withHeight = (spec: DesignSpec, level: number, heightM: number): DesignSpec => ({
  ...spec,
  floors: spec.floors.map((f, i) => (i === level ? { ...f, heightM } : f)),
});

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

describe("undo history", () => {
  it("folds one drag into one step and labels it with the whole change", () => {
    let h = createHistory(SPEC);
    for (const height of [3.2, 3.4, 3.6, 3.8])
      h = applyEdit(h, withHeight(h.present, 10, height), "drag:1");
    h = endGesture(h);
    expect(h.past).toHaveLength(1);
    expect(h.past[0]?.label).toBe("Floor 11: height 3.1 → 3.8 m");
    h = undo(h);
    expect(h.present).toEqual(SPEC);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present.floors[10]?.heightM).toBe(3.8);
  });

  it("leaves no step for a drag that ends where it started, and keeps older steps apart", () => {
    let h = applyEdit(createHistory(SPEC), { ...SPEC, unitSizeM2: 50 });
    h = applyEdit(h, withHeight(h.present, 3, 4), "drag:2");
    h = applyEdit(h, withHeight(h.present, 3, SPEC.floors[3]?.heightM ?? 0), "drag:2");
    expect(h.past).toHaveLength(1);
    h = applyEdit(h, withHeight(h.present, 3, 5), "drag:2");
    expect(h.past).toHaveLength(2);
    expect(h.past[0]?.label).toBe("Unit size: 45 → 50 m²");
  });

  it("starts a new step for each gesture and clears redo on a new edit", () => {
    let h = applyEdit(createHistory(SPEC), withHeight(SPEC, 5, 4), "a");
    h = applyEdit(h, withHeight(h.present, 6, 4), "b");
    expect(h.past).toHaveLength(2);
    h = undo(h);
    h = applyEdit(h, { ...h.present, straight: true });
    expect(canRedo(h)).toBe(false);
    expect(goTo(h, 0).present).toEqual(SPEC);
  });
});

describe("floor stack editing", () => {
  const floors: FloorSpec[] = SPEC.floors;

  it("groups identical consecutive floors", () => {
    const groups = groupFloors(floors);
    expect(groups.reduce((n, g) => n + g.end - g.start + 1, 0)).toBe(floors.length);
    for (const g of groups) {
      for (let l = g.start; l <= g.end; l++) expect(floors[l]).toEqual(g.spec);
    }
  });

  it("changes floors 8–12 to offices in one step", () => {
    const levels = parseLevels("8-12", floors.length);
    expect(levels).toEqual([7, 8, 9, 10, 11]);
    expect(describeLevels(levels ?? [])).toBe("Floors 8–12");
    const next = setFloors(floors, levels ?? [], { use: "office" });
    expect(next.filter((f) => f.use === "office")).toHaveLength(5);
    expect(next.slice(0, 7)).toEqual(floors.slice(0, 7));
    const h = applyEdit(createHistory(SPEC), { ...SPEC, floors: next });
    expect(h.past).toHaveLength(1);
    expect(h.past[0]?.label).toContain("Residential → Office");
  });

  it("refuses floor numbers outside the building", () => {
    expect(parseLevels("0-3", 10)).toBeNull();
    expect(parseLevels("9-11", 10)).toBeNull();
    expect(parseLevels("2, 5", 10)).toEqual([1, 4]);
    expect(parseLevels("x", 10)).toBeNull();
  });

  it("selects by click, Shift-click range, toggle and use", () => {
    let s = clickSelect(EMPTY_SELECTION, [3]);
    s = clickSelect(s, [7], { shift: true });
    expect(s.levels).toEqual([3, 4, 5, 6, 7]);
    s = clickSelect(s, [5], { toggle: true });
    expect(s.levels).toEqual([3, 4, 6, 7]);
    expect(selectByUse(floors, "lobby").levels).toEqual([0]);
  });

  it("adds, duplicates, removes and moves floors", () => {
    const added = addAbove(floors, [2], (below) => ({ ...(below as FloorSpec) }));
    expect(added?.floors).toHaveLength(floors.length + 1);
    expect(added?.selection.levels).toEqual([3]);
    const copies = duplicate(floors, [0, 1]);
    expect(copies?.floors.slice(2, 4)).toEqual(floors.slice(0, 2));
    expect(
      remove(
        floors,
        floors.map((_, i) => i),
      ),
    ).toBeNull();
    const removed = remove(floors, [4]);
    expect(removed?.floors).toHaveLength(floors.length - 1);
    const moved = move(floors, [0], 1);
    expect(moved?.floors[1]).toEqual(floors[0]);
    expect(moved?.selection.levels).toEqual([1]);
    expect(move(floors, [floors.length - 1], 1)).toBeNull();
  });
});

describe("section preview", () => {
  const model = sectionModel(SAMPLE_INPUT, tower.floors, result.envelopes.highRise);

  it("draws one band per floor, stacked to scale", () => {
    expect(model.bands).toHaveLength(tower.floors.length);
    expect(model.heightM).toBeCloseTo(tower.heightM, 6);
    model.bands.forEach((band, i) => {
      expect(band.z1 - band.z0).toBeCloseTo(tower.floors[i]?.heightM ?? 0, 6);
      if (i > 0) expect(band.z0).toBeCloseTo(model.bands[i - 1]?.z1 ?? 0, 6);
      expect(band.x0).toBeGreaterThanOrEqual(model.ground.x0 - 0.01);
      expect(band.x1).toBeLessThanOrEqual(model.ground.x1 + 0.01);
    });
    const layout = layoutSection(model, {
      width: 380,
      height: 300,
      labelWidth: 150,
      padding: 14,
      topRoom: 26,
      lineGap: 15,
    });
    const roof = layout.groundY - model.heightM * layout.scale;
    expect(roof).toBeGreaterThanOrEqual(14);
    expect(model.ground.x1 * layout.scale).toBeLessThanOrEqual(380 - 150 - 28 + 0.01);
  });

  it("labels runs of one use with their count and area", () => {
    const residential = model.groups.find((g) => g.use === "residential");
    const floorsOfUse = tower.floors.filter((f) => f.use === "residential");
    expect(residential?.count).toBe(floorsOfUse.length);
    expect(residential?.areaM2).toBeCloseTo(
      floorsOfUse.reduce((sum, f) => sum + f.areaM2, 0),
      6,
    );
    expect(model.groups.reduce((n, g) => n + g.count, 0)).toBe(tower.floors.length);
  });

  it("spreads crowded labels apart without leaving the drawing", () => {
    const ys = spreadLabels([100, 98, 97, 20, 18], 15, 10, 200);
    for (let i = 1; i < ys.length; i++)
      expect((ys[i - 1] ?? 0) - (ys[i] ?? 0)).toBeGreaterThanOrEqual(15 - 1e-9);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(10);
  });
});

describe("floor schedule CSV", () => {
  it("lists every floor and a total that the rows add up to", () => {
    const csv = floorScheduleCsv(tower);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "Floor,Use,Bottom (m),Top (m),Floor to floor (m),Floor area (m²),Plate,Inset (m)",
    );
    expect(lines).toHaveLength(tower.floors.length + 2);
    const areas = lines.slice(1, -1).map((l) => Number(l.split(",")[5]));
    expect(areas).toEqual(scheduleAreasM2(tower));
    const total = lines.at(-1)?.split(",") ?? [];
    expect(total[0]).toBe("Total");
    expect(Number(total[5])).toBe(areas.reduce((a, b) => a + b, 0));
  });

  it("quotes fields and makes safe file names", () => {
    expect(csvField('A "big", tall')).toBe('"A ""big"", tall"');
    expect(scheduleFileName("B1 · Podium + tower!")).toBe("b1-podium-tower-floors.csv");
  });
});

describe("persistence", () => {
  const source = { id: tower.id, name: tower.name, badge: "B" };

  it("saves and loads variants per plot, dropping invalid ones", () => {
    const storage = new MemoryStorage();
    const key = plotKey(SAMPLE_INPUT.plot.vertices);
    const variant = makeVariant(source, SPEC, []);
    expect(saveVariants(storage, key, [variant])).toBe(true);
    const raw = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}");
    raw.plots[key].variants.push({
      ...raw.plots[key].variants[0],
      id: "custom-bad",
      spec: { name: "" },
    });
    raw.plots[key].variants.push({
      id: "not-a-studio-id",
      badge: "B2",
      source,
      spec: SPEC,
      original: SPEC,
    });
    storage.setItem(STORAGE_KEY, JSON.stringify(raw));

    const loaded = loadVariants(storage, key);
    expect(loaded.map((v) => v.id)).toEqual([variant.id]);
    expect(loaded[0]?.history.present).toEqual(variant.history.present);
    expect(loadVariants(storage, "another-plot")).toEqual([]);
  });

  it("survives corrupt storage and keeps a bounded number of plots", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, "{not json");
    expect(loadVariants(storage, "p")).toEqual([]);
    const variant = makeVariant(source, SPEC, []);
    for (let i = 0; i < 20; i++) saveVariants(storage, `plot-${i}`, [variant], { now: i });
    const plots = Object.keys(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}").plots);
    expect(plots).toHaveLength(12);
    expect(plots).toContain("plot-19");
    expect(plots).not.toContain("plot-0");
  });

  it("refuses a stored spec the schema rejects", () => {
    expect(
      parseStoredVariant({
        id: "custom-x",
        badge: "B1",
        source,
        spec: { ...SPEC, floors: [] },
        original: SPEC,
      }),
    ).toBeNull();
  });
});

describe("variant lifecycle", () => {
  beforeEach(() => useStudio.getState().replaceVariants([]));

  it("creates, edits, duplicates, resets and deletes a variant", () => {
    const studio = () => useStudio.getState();
    const variant = makeVariant({ id: tower.id, name: tower.name, badge: "B" }, SPEC, []);
    studio().addVariant(variant);
    expect(variant.badge).toBe("B1");
    expect(variant.id).toMatch(/^custom-[a-z0-9]+$/);

    studio().edit(variant.id, (s) => ({ ...s, unitSizeM2: 60 }));
    const copy = studio().duplicateVariant(variant.id);
    expect(copy?.badge).toBe("B2");
    expect(copy?.history.present.unitSizeM2).toBe(60);

    studio().reset(variant.id, SPEC);
    const reset = studio().variants[0];
    expect(reset?.history.present.unitSizeM2).toBe(SPEC.unitSizeM2);
    expect(reset?.history.past).toHaveLength(2);

    studio().deleteVariant(variant.id);
    expect(studio().variants.map((v) => v.id)).toEqual([copy?.id]);
  });
});

describe("edited designs in the worker", () => {
  it("validates the request at the boundary", () => {
    const reply = handleBuildCustom(SAMPLE_INPUT, { ...SPEC, floors: [] }, "custom-x");
    expect(reply.kind).toBe("invalid");
    expect(handleBuildCustom(SAMPLE_INPUT, SPEC, "midrise").kind).toBe("invalid");
    const ok = handleBuildCustom(SAMPLE_INPUT, SPEC, "custom-x");
    expect(ok.kind === "custom" && ok.result.ok && ok.result.design.gfaM2).toBeCloseTo(
      tower.gfaM2,
      -1,
    );
  });

  it("finds the floors that leave the envelope when fitting is off", () => {
    const spec: DesignSpec = {
      ...SPEC,
      fitToEnvelope: false,
      tower: SPEC.tower ? { ...SPEC.tower, widthM: 90 } : null,
    };
    const built = buildCustomDesign(SAMPLE_INPUT, spec, "custom-x");
    expect(built.ok).toBe(true);
    const levels = breachLevels(SAMPLE_INPUT, spec, "custom-x");
    expect(levels.length).toBeGreaterThan(0);
    // Every level reported adds area outside; the fitted spec reports none.
    expect(breachLevels(SAMPLE_INPUT, SPEC, "custom-x")).toEqual([]);
  });
});

describe("recommendation", () => {
  it("picks the passing option with the most floor area", () => {
    expect(
      recommendedId([
        { id: "a", passes: true, gfaM2: 100 },
        { id: "b", passes: false, gfaM2: 500 },
        { id: "c", passes: true, gfaM2: 300 },
      ]),
    ).toBe("c");
    expect(recommendedId([{ id: "a", passes: false, gfaM2: 1 }])).toBeNull();
  });
});
