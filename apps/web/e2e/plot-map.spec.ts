import { expect, type Page, test } from "@playwright/test";

type LngLat = [number, number];

/** The plot inputs live in the inspector's Plot section. */
async function openSiteStep(page: Page) {
  await page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Plot" }).click();
}

/** Waits for the map and returns a function that turns lng/lat into page coordinates. */
async function openMap(page: Page) {
  await page.goto("/");
  await page.waitForFunction(
    () =>
      (
        window as unknown as { __envelopeMap?: { isStyleLoaded(): boolean } }
      ).__envelopeMap?.isStyleLoaded(),
    null,
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: "Switch to a flat 2D view" }).click();
  await page.waitForFunction(
    () => {
      const map = (
        window as unknown as {
          __envelopeMap: { getPitch(): number; isMoving(): boolean };
        }
      ).__envelopeMap;
      return map.getPitch() === 0 && !map.isMoving();
    },
    null,
    { timeout: 30_000 },
  );
  await openSiteStep(page);
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
  await expect(page.getByTestId("plot-area")).toHaveText("3,490 m²");
  await expect(sides(page)).toHaveCount(5);
  await expect(page.getByRole("combobox", { name: "Side 1 faces" })).toHaveText(/Soi Sukhumvit 19/);
  await expect(status(page)).toHaveText(/ready for the rules check/);
});

test("dragging a corner updates the area live", async ({ page }) => {
  const project = await openMap(page);
  await drag(page, await project(SAMPLE_FRONT_SOUTH), -40, 30);
  await expect(page.getByTestId("plot-area")).not.toHaveText("3,490 m²");
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
  const siteData = page.waitForResponse((r) => r.url().includes("/api/site/plot-context"));
  const first = await project(corners[0] as LngLat);
  await page.mouse.click(first.x, first.y);
  await expect(sides(page)).toHaveCount(4);

  // This plot lies along Soi Sukhumvit 19, so site data may mark a side automatically; clear
  // every side to test marking by hand.
  await siteData;
  for (let i = 1; i <= 4; i++) {
    const side = page.getByRole("combobox", { name: `Side ${i} faces` });
    if ((await side.textContent())?.trim() === "Neighbour") continue;
    await side.click();
    await page.getByRole("option", { name: "Neighbour" }).click();
  }
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
  await expect(page.getByText("sides cross or touch each other", { exact: false })).toBeVisible();
  await expect(status(page)).toHaveText(/Finish drawing the plot/);
});

test("Esc cancels drawing and restores the plot", async ({ page }) => {
  await openMap(page);
  await page.getByRole("button", { name: "Draw a new plot" }).click();
  await expect(page.getByText("Click to place each corner")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sides(page)).toHaveCount(5);
  await expect(page.getByTestId("plot-area")).toHaveText("3,490 m²");
});

test("right-clicking a corner removes it", async ({ page }) => {
  const project = await openMap(page);
  const back: LngLat = [100.5604544, 13.7384977];
  const pt = await project(back);
  await page.mouse.click(pt.x, pt.y, { button: "right" });
  await expect(sides(page)).toHaveCount(4);
  await expect(page.getByRole("combobox", { name: "Side 1 faces" })).toHaveText(/Soi Sukhumvit 19/);
});

test("a corner placed near the first one does not close a narrow plot early", async ({ page }) => {
  const project = await openMap(page);
  await page.getByRole("button", { name: "Draw a new plot" }).click();
  const first = await project([100.5599, 13.7383]);
  // A 6 m wide plot: its last corner lands about 20 px from the first at this zoom.
  const last = await project([100.5599, 13.738355]);
  expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeLessThan(40);
  const corners = [
    first,
    await project([100.5604, 13.7383]),
    await project([100.5604, 13.738355]),
    last,
  ];
  for (const pt of corners) await page.mouse.click(pt.x, pt.y);
  await page.mouse.click(first.x, first.y);
  await expect(sides(page)).toHaveCount(4);
});

test("Enter finishes a plot, as the drawing hints say", async ({ page }) => {
  const project = await openMap(page);
  await page.getByRole("button", { name: "Draw a new plot" }).click();
  for (const c of [
    [100.5599, 13.7383],
    [100.5602, 13.7383],
    [100.5602, 13.7386],
  ] as LngLat[]) {
    const pt = await project(c);
    await page.mouse.click(pt.x, pt.y);
  }
  await expect(page.getByTestId("draw-hud")).toContainText("Enter finishes");
  await page.keyboard.press("Enter");
  await expect(sides(page)).toHaveCount(3);
});

/** Text of the labels MapLibre is drawing on one of our symbol layers. */
function labels(page: Page, layer: string) {
  return page.evaluate(
    (id) =>
      (
        window as unknown as {
          __envelopeMap: {
            queryRenderedFeatures(o: { layers: string[] }): { properties: { text: string } }[];
          };
        }
      ).__envelopeMap
        .queryRenderedFeatures({ layers: [id] })
        .map((f) => f.properties.text),
    layer,
  );
}

test("measurements follow the pointer while drawing, and Backspace removes a corner", async ({
  page,
}) => {
  const project = await openMap(page);
  await page.getByRole("button", { name: "Draw a new plot" }).click();
  const hud = page.getByTestId("draw-hud");
  const corners: LngLat[] = [
    [100.5599, 13.7383],
    [100.5602, 13.7383],
    [100.5602, 13.7386],
  ];
  for (const c of corners.slice(0, 2)) {
    const pt = await project(c);
    await page.mouse.click(pt.x, pt.y);
  }
  const cursor = await project([100.56005, 13.7387]);
  await page.mouse.move(cursor.x, cursor.y, { steps: 4 });

  await expect.poll(() => labels(page, "plot-measure-length")).toContain("32.4 m");
  await expect
    .poll(() => labels(page, "plot-measure-live"))
    .toEqual([expect.stringMatching(/^\d+\.\d m · \d+°$/)]);
  await expect(hud).toContainText("Perimeter");
  await expect(hud).not.toContainText("Area");

  const third = await project(corners[2] as LngLat);
  await page.mouse.click(third.x, third.y);
  await expect(hud).toContainText("Area");
  await expect(hud).toContainText("m²");
  await expect.poll(() => labels(page, "plot-measure-angle")).toHaveLength(3);

  await page.keyboard.press("Backspace");
  await expect(hud).not.toContainText("Area");
  await expect(hud.getByText("2", { exact: true })).toBeVisible();
});

test("dragging a corner shows its two sides and its angle", async ({ page }) => {
  const project = await openMap(page);
  const from = await project(SAMPLE_FRONT_SOUTH);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(from.x - i * 5, from.y + i * 4);

  await expect
    .poll(() => labels(page, "plot-sides-label-active"))
    .toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Soi Sukhumvit 19 · 10 m road · \d+\.\d m$/),
        expect.stringMatching(/^\d · \d+\.\d m$/),
      ]),
    );
  await expect
    .poll(() => labels(page, "plot-measure-live"))
    .toEqual([expect.stringMatching(/^\d+°/)]);
  await page.mouse.up();
  await expect(page.getByTestId("plot-perimeter")).toContainText("5 sides");
});
