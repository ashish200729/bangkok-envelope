import { expect, type Page, test } from "@playwright/test";

type LngLat = [number, number];

/** Waits for the map and returns a function that turns lng/lat into page coordinates. */
async function openMap(page: Page) {
  await page.goto("/");
  await page.waitForFunction(
    () => (window as unknown as { __envelopeMap?: { loaded(): boolean } }).__envelopeMap?.loaded(),
    null,
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: "Switch to a flat 2D view" }).click();
  await page.waitForTimeout(900);
  const box = await page.getByTestId("plot-map").boundingBox();
  if (!box) throw new Error("map has no size");
  return async (lngLat: LngLat) => {
    const pt = await page.evaluate(
      (p) =>
        (
          window as unknown as {
            __envelopeMap: { project(p: LngLat): { x: number; y: number } };
          }
        ).__envelopeMap.project(p),
      lngLat,
    );
    return { x: box.x + pt.x, y: box.y + pt.y };
  };
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + (dx * i) / 8, from.y + (dy * i) / 8);
  await page.mouse.up();
}

const SAMPLE_FRONT_SOUTH: LngLat = [100.5599408, 13.7382914];
const SAMPLE_FRONT_NORTH: LngLat = [100.5600231, 13.7388977];
const sides = (page: Page) => page.getByTestId("sides").locator("li");
const status = (page: Page) => page.getByTestId("input-status");

test("opens on the sample plot facing Soi Sukhumvit 19", async ({ page }) => {
  await openMap(page);
  await expect(page.getByTestId("plot-area")).toHaveText("3,503 m²");
  await expect(sides(page)).toHaveCount(5);
  await expect(page.getByRole("combobox", { name: "Side 1 faces" })).toHaveText(/Soi Sukhumvit 19/);
  await expect(status(page)).toHaveText(/ready for the rules check/);
});

test("dragging a corner updates the area live", async ({ page }) => {
  const project = await openMap(page);
  await drag(page, await project(SAMPLE_FRONT_SOUTH), -40, 30);
  await expect(page.getByTestId("plot-area")).not.toHaveText("3,503 m²");
  await expect(sides(page)).toHaveCount(5);
});

test("inserting a corner on the road side keeps both halves on the road", async ({ page }) => {
  const project = await openMap(page);
  const mid = await project([
    (SAMPLE_FRONT_SOUTH[0] + SAMPLE_FRONT_NORTH[0]) / 2,
    (SAMPLE_FRONT_SOUTH[1] + SAMPLE_FRONT_NORTH[1]) / 2,
  ]);
  await drag(page, mid, -30, 0);
  await expect(sides(page)).toHaveCount(6);
  await expect(page.getByRole("combobox", { name: "Side 1 faces" })).toHaveText(/Soi Sukhumvit 19/);
  await expect(page.getByRole("combobox", { name: "Side 2 faces" })).toHaveText(/Soi Sukhumvit 19/);
});

test("a new plot can be drawn, then a road side marked", async ({ page }) => {
  const project = await openMap(page);
  await page.getByRole("button", { name: "Draw a new plot" }).click();
  const corners: LngLat[] = [
    [100.5599, 13.7383],
    [100.5602, 13.7383],
    [100.5602, 13.7386],
    [100.5599, 13.7386],
  ];
  for (const c of corners) {
    const pt = await project(c);
    await page.mouse.click(pt.x, pt.y);
  }
  const first = await project(corners[0] as LngLat);
  await page.mouse.click(first.x, first.y);

  await expect(sides(page)).toHaveCount(4);
  await expect(status(page)).toHaveText(/Mark at least one side that faces a public road/);

  await page.getByRole("combobox", { name: "Side 1 faces" }).click();
  await page.getByRole("option", { name: "New road…" }).click();
  await expect(page.getByLabel("Road A width")).toHaveValue("12");
  await expect(status(page)).toHaveText(/ready for the rules check/);
});

test("a self-crossing outline is refused", async ({ page }) => {
  const project = await openMap(page);
  await page.getByRole("button", { name: "Draw a new plot" }).click();
  const bowTie: LngLat[] = [
    [100.5599, 13.7383],
    [100.5602, 13.7386],
    [100.5602, 13.7383],
    [100.5599, 13.7386],
  ];
  for (const c of bowTie) {
    const pt = await project(c);
    await page.mouse.click(pt.x, pt.y);
  }
  const first = await project(bowTie[0] as LngLat);
  await page.mouse.click(first.x, first.y);
  await expect(page.getByText("The outline crosses itself", { exact: false })).toBeVisible();
  await expect(status(page)).toHaveText(/Finish drawing the plot/);
});

test("Esc cancels drawing and restores the plot", async ({ page }) => {
  await openMap(page);
  await page.getByRole("button", { name: "Draw a new plot" }).click();
  await expect(page.getByText("Click to place each corner")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sides(page)).toHaveCount(5);
  await expect(page.getByTestId("plot-area")).toHaveText("3,503 m²");
});

test("right-clicking a corner removes it", async ({ page }) => {
  const project = await openMap(page);
  const back: LngLat = [100.5604544, 13.7384977];
  const pt = await project(back);
  await page.mouse.click(pt.x, pt.y, { button: "right" });
  await expect(sides(page)).toHaveCount(4);
  await expect(page.getByRole("combobox", { name: "Side 1 faces" })).toHaveText(/Soi Sukhumvit 19/);
});
