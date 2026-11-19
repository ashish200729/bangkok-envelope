import { expect, type Page, test } from "@playwright/test";

type LngLat = [number, number];
type DeckLayer = { id: string; length: number };
type DeckView = {
  designId: string | null;
  selectedFloor: number | null;
  night: boolean;
  sun: { timestampMs: number; direction: [number, number, number] | null };
  callouts: { kind: string; text: string }[];
};
type TestMap = {
  isStyleLoaded(): boolean;
  getPitch(): number;
  isMoving(): boolean;
  project(p: LngLat): { x: number; y: number };
  getLayoutProperty(layer: string, name: string): unknown;
  getFilter(layer: string): unknown;
  getLayer(layer: string): unknown;
  getStyle(): { layers: { id: string }[] };
  querySourceFeatures(source: string): unknown[];
};
type TestWindow = {
  __envelopeMap: TestMap;
  __envelopeDeck: { layers(): DeckLayer[]; view(): DeckView };
  __asBuilt: { getState(): { buildings: unknown[]; footprintM2: number } };
};

const SAMPLE_CENTRE: LngLat = [100.5602, 13.7386];

async function openWithDesign(page: Page) {
  await page.goto("/");
  await page.waitForFunction(
    () => (window as unknown as TestWindow).__envelopeMap?.isStyleLoaded(),
    null,
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: "Switch to a flat 2D view" }).click();
  await page.waitForFunction(
    () => {
      const map = (window as unknown as TestWindow).__envelopeMap;
      return map.getPitch() === 0 && !map.isMoving();
    },
    null,
    { timeout: 30_000 },
  );
  await expect.poll(() => layerIds(page)).toContain("envelope");
  await page.getByRole("tab", { name: "Designs" }).click();
  const card = page.getByTestId("designs").locator("article").filter({ hasText: "Podium" });
  await card.getByRole("button", { name: "Show on the map" }).click();
  await expect.poll(() => layerIds(page)).toContain("design-floors");
}

const layers = (page: Page) =>
  page.evaluate(() => (window as unknown as TestWindow).__envelopeDeck.layers());
const layerIds = (page: Page) =>
  page.evaluate(() =>
    ((window as unknown as TestWindow).__envelopeDeck?.layers() ?? []).map((l) => l.id),
  );
const view = (page: Page) =>
  page.evaluate(() => (window as unknown as TestWindow).__envelopeDeck.view());

async function pageXY(page: Page, lngLat: LngLat) {
  const box = await page.getByTestId("plot-map").boundingBox();
  const pt = await page.evaluate(
    (p) => (window as unknown as TestWindow).__envelopeMap.project(p),
    lngLat,
  );
  return { x: (box?.x ?? 0) + pt.x, y: (box?.y ?? 0) + pt.y };
}

test("a design is drawn as massing with floor lines, a roof plant room, trees and callouts", async ({
  page,
}) => {
  await openWithDesign(page);
  const byId = new Map((await layers(page)).map((l) => [l.id, l.length]));
  for (const id of [
    "design-floors",
    "design-slabs",
    "design-roofs",
    "design-details",
    "design-edges",
  ]) {
    expect(byId.get(id), id).toBeGreaterThan(0);
  }
  expect(byId.get("design-floors")).toBe(byId.get("design-slabs"));
  expect(byId.get("site-ground")).toBeGreaterThan(0);
  expect(byId.has("site-trees")).toBe(true);
  // Windows are a night-time detail; by day the massing stays clean.
  expect(byId.has("design-windows")).toBe(false);
  // The envelope stays as a ghost around the design.
  expect(byId.get("envelope")).toBeGreaterThan(0);

  const callouts = page.getByTestId("scene-callouts");
  await expect(callouts.locator('[data-callout="height"]')).toHaveText(/^\d+ m · \d+ storeys$/);
  await expect(callouts.locator('[data-callout="setback"]')).toHaveText("6 m setback");
  await expect(page.getByTestId("map-legend")).toContainText("parking");
});

test("the sun presets move the light, and night lights the windows", async ({ page }) => {
  await openWithDesign(page);
  const before = await view(page);
  await page.getByRole("button", { name: /Sun position/ }).click();
  await page.getByRole("button", { name: "9:00" }).click();
  await expect(page.getByTestId("sun-hour")).toHaveText("09:00");
  await expect
    .poll(async () => (await view(page)).sun.timestampMs)
    .not.toBe(before.sun.timestampMs);
  const morning = await view(page);
  // Morning sun in the east: its light travels west.
  expect(morning.sun.direction?.[0]).toBeLessThan(0);
  await page.getByRole("button", { name: "16:00" }).click();
  await expect.poll(async () => (await view(page)).sun.direction?.[0] ?? 0).toBeGreaterThan(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Night view" }).click();
  await expect.poll(async () => (await view(page)).night).toBe(true);
  await expect.poll(() => layerIds(page)).toContain("design-windows");
  const windows = (await layers(page)).find((l) => l.id === "design-windows");
  expect(windows?.length).toBeGreaterThan(100);
  await page.getByRole("button", { name: "Night view" }).click();
  await expect.poll(() => layerIds(page)).not.toContain("design-windows");
});

test("clicking a floor selects it and clicking empty map clears it", async ({ page }) => {
  await openWithDesign(page);
  const centre = await pageXY(page, SAMPLE_CENTRE);
  await page.mouse.click(centre.x, centre.y);
  await expect.poll(async () => (await view(page)).selectedFloor).not.toBeNull();
  await expect.poll(() => layerIds(page)).toContain("floor-selected");
  const box = await page.getByTestId("plot-map").boundingBox();
  await page.mouse.click((box?.x ?? 0) + 40, (box?.y ?? 0) + (box?.height ?? 0) - 60);
  await expect.poll(async () => (await view(page)).selectedFloor).toBeNull();
  await expect.poll(() => layerIds(page)).not.toContain("floor-selected");
});

test("the map chips switch the setback, the height limit and the building there today", async ({
  page,
}) => {
  await openWithDesign(page);
  await expect.poll(() => layerIds(page)).toContain("site-setback");
  await page.getByRole("button", { name: "Setback" }).click();
  await expect.poll(() => layerIds(page)).not.toContain("site-setback");
  await expect(page.locator('[data-callout="setback"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Height limit" }).click();
  await expect.poll(() => layerIds(page)).not.toContain("envelope");
  await page.getByRole("button", { name: "Height limit" }).click();
  await expect.poll(() => layerIds(page)).toContain("envelope");

  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as TestWindow).__asBuilt.getState().buildings.length),
    )
    .toBeGreaterThan(0);
  const asBuilt = () =>
    page.evaluate(() =>
      (window as unknown as TestWindow).__envelopeMap.getLayoutProperty(
        "as-built-3d",
        "visibility",
      ),
    );
  expect(await asBuilt()).toBe("none");
  await page.getByRole("button", { name: "As built" }).click();
  await expect.poll(asBuilt).toBe("visible");
});

test("the basemap hides shop and café icons but keeps rail stations", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(
    () => (window as unknown as TestWindow).__envelopeMap?.isStyleLoaded(),
    null,
    { timeout: 90_000 },
  );
  const state = await page.evaluate(() => {
    const map = (window as unknown as TestWindow).__envelopeMap;
    return {
      pois: ["poi_r1", "poi_r7", "poi_r20"].map((id) => map.getLayoutProperty(id, "visibility")),
      transit: map.getFilter("poi_transit"),
      roadNames: map.getLayoutProperty("highway-name-minor", "visibility") ?? "visible",
      restored: Boolean(map.getLayer("buildings-restored")),
    };
  });
  expect(state.pois).toEqual(["none", "none", "none"]);
  expect(state.transit).toEqual(["==", ["get", "class"], "rail"]);
  expect(state.roadNames).toBe("visible");
  expect(state.restored).toBe(true);
});
