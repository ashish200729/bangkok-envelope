import { expect, type Page, test } from "@playwright/test";

type LngLat = [number, number];
type TestMap = {
  isStyleLoaded(): boolean;
  getPitch(): number;
  isMoving(): boolean;
  project(p: LngLat): { x: number; y: number };
};
type DeckLayer = { id: string; length: number };
type DeckView = {
  envelopeKind: "lowRise" | "highRise" | null;
  maxHeightM: number | null;
  groundAreaM2: number | null;
  designId: string | null;
};
type TestDeck = {
  layers(): DeckLayer[];
  view(): DeckView;
  pick(x: number, y: number): { kind: string } | null;
};
type TestWindow = { __envelopeMap: TestMap; __envelopeDeck?: TestDeck; __noReload?: boolean };

/** The sample plot on Asok Montri Road (packages/engine/src/fixtures.ts). */
const SAMPLE_FRONT_SOUTH: LngLat = [100.5621287, 13.7418313];
const SAMPLE_CENTRE: LngLat = [100.5624, 13.7421];

/** Opens the tool flat (2D), waits for the envelope layer and returns a lng/lat → page projector. */
async function openTool(page: Page) {
  await page.goto("/");
  await page.waitForFunction(
    () => (window as unknown as TestWindow).__envelopeMap?.isStyleLoaded(),
    null,
    {
      timeout: 90_000,
    },
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
  // The camera refits once a scheme is selected; positions on screen are stable only after that.
  await expect.poll(async () => (await deckView(page))?.designId ?? null).not.toBeNull();
  await page.waitForFunction(
    () => !(window as unknown as TestWindow).__envelopeMap.isMoving(),
    null,
    { timeout: 30_000 },
  );
  await page.evaluate(() => {
    (window as unknown as TestWindow).__noReload = true;
  });
  await openTab(page, "Plot");
  const box = await page.getByTestId("plot-map").boundingBox();
  if (!box) throw new Error("map has no size");
  return async (lngLat: LngLat) => {
    const pt = await page.evaluate(
      (p) => (window as unknown as TestWindow).__envelopeMap.project(p),
      lngLat,
    );
    return { x: box.x + pt.x, y: box.y + pt.y };
  };
}

const layerIds = (page: Page) =>
  page.evaluate(() =>
    ((window as unknown as TestWindow).__envelopeDeck?.layers() ?? []).map((l) => l.id),
  );
const deckView = (page: Page) =>
  page.evaluate(() => (window as unknown as TestWindow).__envelopeDeck?.view() ?? null);
const notReloaded = (page: Page) =>
  page.evaluate(() => (window as unknown as TestWindow).__noReload === true);

/** The inspector's sections: Plot, Rules, Schemes (the designs) and Money. */
async function openTab(page: Page, name: "Plot" | "Rules" | "Designs" | "Money") {
  await page
    .getByRole("tablist", { name: "Sections" })
    .getByRole("tab", { name: name === "Designs" ? "Schemes" : name, exact: true })
    .click();
}

test("the allowed space appears on the map as stacked slices", async ({ page }) => {
  await openTool(page);
  const layers = await page.evaluate(() =>
    (window as unknown as TestWindow).__envelopeDeck?.layers(),
  );
  const envelope = layers?.find((l) => l.id === "envelope");
  expect(envelope?.length).toBeGreaterThan(1);
  expect(layers?.map((l) => l.id)).toContain("envelope-edges");
  expect((await deckView(page))?.envelopeKind).toBe("highRise");

  await openTab(page, "Rules");
  await expect(page.getByTestId("sum-max-height")).toHaveText("140 m");
  await page.getByRole("radio", { name: "Low-rise (under 23 m)" }).click();
  await expect(page.getByTestId("sum-max-height")).toHaveText("23 m");
  await expect.poll(async () => (await deckView(page))?.envelopeKind).toBe("lowRise");
});

test("switching off the road setback widens the envelope", async ({ page }) => {
  await openTool(page);
  await openTab(page, "Rules");
  const ground = page.getByTestId("sum-ground-area");
  const before = await ground.textContent();
  const mapBefore = (await deckView(page))?.groundAreaM2;

  await page.getByRole("switch", { name: "Apply: Road setback" }).click();
  await expect(ground).not.toHaveText(before ?? "");
  await expect(page.getByTestId("rule-setback.road").first()).toHaveAttribute(
    "data-enabled",
    "false",
  );
  await expect
    .poll(async () => (await deckView(page))?.groundAreaM2)
    .toBeGreaterThan(mapBefore ?? 0);

  await page.getByRole("switch", { name: "Apply: Road setback" }).click();
  await expect(ground).toHaveText(before ?? "");
  expect(await notReloaded(page)).toBe(true);
});

test("a wider road raises the allowed height", async ({ page }) => {
  await openTool(page);
  await page.getByLabel("Asok Montri Road width").fill("20");
  await openTab(page, "Rules");
  await expect(page.getByTestId("sum-max-height")).not.toHaveText("140 m");
  await expect.poll(async () => (await deckView(page))?.maxHeightM).toBeGreaterThan(140);

  await openTab(page, "Plot");
  await page.getByLabel("Asok Montri Road width").fill("8");
  await openTab(page, "Rules");
  await expect(page.getByTestId("sum-max-height")).toHaveText("23 m");
  await expect(page.getByTestId("high-rise-blocked")).toBeVisible();
  await expect(page.getByRole("radio", { name: "High-rise" })).toBeDisabled();
  expect(await notReloaded(page)).toBe(true);
});

test("changing the building type updates the designs", async ({ page }) => {
  await openTool(page);
  await openTab(page, "Designs");
  const designs = page.getByTestId("designs").locator("[data-testid^=option-]");
  expect(await designs.count()).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  const comparison = page.getByTestId("design-comparison");
  await expect(comparison).toContainText("Units");

  await openTab(page, "Plot");
  await page.getByRole("combobox", { name: "Building type" }).click();
  await page.getByRole("option", { name: "Hotel" }).click();
  await openTab(page, "Designs");
  await expect(comparison).toContainText("Rooms");
  await expect(comparison).not.toContainText("Units");
  await expect(page.getByTestId("shape-tab")).toContainText(/hotel/i);
  expect(await notReloaded(page)).toBe(true);
});

test("selecting a design draws its floors and every schedule adds up", async ({ page }) => {
  const project = await openTool(page);
  await openTab(page, "Designs");
  const cards = page.getByTestId("designs").locator("[data-testid^=option-]");
  await cards.first().click();
  await expect(cards.first()).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await deckView(page))?.designId).toBe("midrise");
  await expect.poll(() => layerIds(page)).toContain("design-floors");

  const shape = page.getByTestId("shape-tab");
  const m2 = (text: string) => Number(text.replace(/[^\d]/g, ""));
  for (const card of await cards.all()) {
    await card.click();
    await shape.getByTestId("floor-schedule").locator("summary").click();
    const schedule = shape.locator("table");
    const rows = await schedule.locator("tbody tr td:last-child").allTextContents();
    const shown = (await schedule.getByTestId("schedule-total").textContent()) ?? "";
    expect(rows.reduce((sum, row) => sum + m2(row), 0)).toBe(m2(shown));
    await expect(card.getByTestId("card-gfa")).toContainText(shown);
    await shape.getByTestId("floor-schedule").locator("summary").click();
  }
  await cards.first().click();

  const centre = await project(SAMPLE_CENTRE);
  await page.mouse.move(centre.x, centre.y);
  await expect(page.getByTestId("scene-tooltip")).toHaveText(/^Floor \d+ · \w+ · [\d,]+ m²$/);
});

test("dragging a plot corner reshapes the envelope without a reload", async ({ page }) => {
  const project = await openTool(page);
  const before = (await deckView(page))?.groundAreaM2 ?? 0;
  const from = await project(SAMPLE_FRONT_SOUTH);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Inward (north-east). Outward, the corner would reach the neighbour's building and the plot
  // would wait for its demolition to be confirmed (decision 59).
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + i * 5, from.y - i * 4);
  await expect
    .poll(async () => (await deckView(page))?.groundAreaM2 ?? before)
    .not.toBeCloseTo(before, 0);
  await page.mouse.up();
  expect(await notReloaded(page)).toBe(true);
});

test("a road width the law cannot use is flagged, and the last valid width stays in use", async ({
  page,
}) => {
  await openTool(page);
  const width = page.getByLabel("Asok Montri Road width");
  await width.fill("20");
  await width.fill("201");
  await expect(width).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByText("Enter a road width from 0.5 to 200 m. Still using 20 m."),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Side 1 faces" })).toHaveText(/\(20 m\)/);
  await width.fill("-5");
  await expect(page.getByText("Still using 20 m.")).toBeVisible();
  await width.blur();
  await expect(width).toHaveValue("20");
  await expect(width).not.toHaveAttribute("aria-invalid");

  await width.fill("200");
  await openTab(page, "Rules");
  await expect(page.getByTestId("sum-max-height")).toHaveText("No limit");
  await expect(page.getByText(/height plane does not bind/)).toBeVisible();
  await expect(page.getByText("Height plane switched off")).toHaveCount(0);
});

test("the floor area bonus can be typed freely and is limited to 0–20%", async ({ page }) => {
  await openTool(page);
  await openTab(page, "Rules");
  const bonus = page.getByLabel("Floor area bonus claimed");
  await bonus.fill("");
  await bonus.pressSequentially("15", { delay: 50 });
  await expect(bonus).toHaveValue("15");
  await expect(page.getByTestId("rule-far.bonus")).toContainText("+1.2×");
  await bonus.fill("25");
  await expect(bonus).toHaveValue("25");
  await expect(page.getByText("Enter a bonus from 0 to 20%. Still using 15%.")).toBeVisible();
  await expect(page.getByTestId("rule-far.bonus")).toContainText("+1.2×");
});

test("keyboard focus is visible on the tab panels and the map", async ({ page }) => {
  await openTool(page);
  await page.getByRole("tab", { name: "Plot" }).focus();
  await page.keyboard.press("Tab");
  const panel = page.getByRole("tabpanel", { name: "Plot" });
  await expect(panel).toBeFocused();
  expect(await panel.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");

  await page.getByRole("button", { name: "Change theme" }).focus();
  await page.keyboard.press("Tab");
  const map = page.getByTestId("plot-map").locator("canvas");
  await expect(map).toBeFocused();
  expect(await map.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`the design comparison fits without sideways scrolling at ${viewport.width} px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openTool(page);
    await page.getByLabel("Asok Montri Road width").fill("30");
    await openTab(page, "Rules");
    await page.getByLabel("Floor area bonus claimed").fill("20");
    await openTab(page, "Designs");
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    const table = page.getByTestId("design-comparison");
    await expect(table).toBeVisible();
    await expect(table).toContainText("Residual land");
    if (viewport.width >= 1024) {
      const [scroll, client] = await table.evaluate((t) => [
        t.parentElement?.scrollWidth ?? 0,
        t.parentElement?.clientWidth ?? 0,
      ]);
      expect(scroll).toBeLessThanOrEqual(client);
    }
    await page.keyboard.press("Escape");
    await expect(table).toBeHidden();
    const [docScroll, docClient] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(docScroll).toBeLessThanOrEqual(docClient);
  });
}
