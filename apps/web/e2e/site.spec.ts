import { expect, type Page, test } from "@playwright/test";

type LngLat = [number, number];
type TestMap = {
  isStyleLoaded(): boolean;
  getPitch(): number;
  isMoving(): boolean;
  jumpTo(o: { center: LngLat; zoom: number }): void;
  project(p: LngLat): { x: number; y: number };
};

function settled(page: Page) {
  return page.waitForFunction(
    () => {
      const map = (window as unknown as { __envelopeMap: TestMap }).__envelopeMap;
      return map.getPitch() === 0 && !map.isMoving();
    },
    null,
    { timeout: 30_000 },
  );
}

async function openMap(page: Page) {
  await page.goto("/");
  await page.waitForFunction(
    () => (window as unknown as { __envelopeMap?: TestMap }).__envelopeMap?.isStyleLoaded(),
    null,
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: "Switch to a flat 2D view" }).click();
  await settled(page);
  await openSiteStep(page);
}

/** The plot inputs live in the inspector's Plot section. */
async function openSiteStep(page: Page) {
  await page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Plot" }).click();
}

async function drawPlot(page: Page, corners: LngLat[]) {
  const box = await page.getByTestId("plot-map").boundingBox();
  if (!box) throw new Error("map has no size");
  const project = async (lngLat: LngLat) => {
    const pt = await page.evaluate(
      (p) => (window as unknown as { __envelopeMap: TestMap }).__envelopeMap.project(p),
      lngLat,
    );
    return { x: box.x + pt.x, y: box.y + pt.y };
  };
  await page.getByRole("button", { name: "Draw a new plot" }).click();
  for (const c of [...corners, corners[0] as LngLat]) {
    const pt = await project(c);
    await page.mouse.click(pt.x, pt.y);
  }
  await expect(page.getByTestId("sides").locator("li")).toHaveCount(corners.length);
}

const station = (page: Page) => page.getByLabel("Distance to nearest BTS/MRT station");

test("the sample keeps its hand-set road and shows OSM's width as a suggestion", async ({
  page,
}) => {
  await openMap(page);
  const suggestion = page.getByTestId("road-suggestion");
  await expect(suggestion).toHaveText(
    /OSM suggests Soi Sukhumvit 19 · 8 m \(estimated from road type\)/,
  );
  await expect(page.getByLabel("Soi Sukhumvit 19 width")).toHaveValue("10");
  await expect(page.getByTestId("road-width-source")).toHaveText("Width entered by you");
  await expect(page.getByRole("combobox", { name: "Side 1 faces" })).toHaveText(/10 m/);
  await expect(page.getByTestId("input-status")).toHaveText(/ready for the rules check/);
  await expect(page.getByTestId("station-detected")).toHaveText(
    "Asok · BTS Sukhumvit Line · 129 m",
  );
  await expect(station(page)).toHaveValue("129");
  await expect(page.getByTestId("site-attribution")).toHaveText(
    /© OpenStreetMap contributors, ODbL · data as of \d+ \w+ 20\d\d/,
  );

  await suggestion.getByRole("button", { name: /Apply/ }).click();
  await expect(page.getByLabel("Soi Sukhumvit 19 width")).toHaveValue("8");
  await expect(page.getByTestId("road-width-source")).toHaveText(
    "Width estimated from road type — check on site",
  );
  await expect(suggestion).toHaveCount(0);
});

test("a plot drawn along Soi Sukhumvit 19 picks up the road and the station", async ({ page }) => {
  await openMap(page);
  await drawPlot(page, [
    [100.55995, 13.73832],
    [100.5603, 13.73828],
    [100.5603, 13.73875],
    [100.56002, 13.73878],
  ]);
  const side4 = page.getByRole("combobox", { name: "Side 4 faces" });
  await expect(side4).toHaveText(/Soi Sukhumvit 19 \(8 m\)/);
  await expect(page.getByLabel("Soi Sukhumvit 19 width")).toHaveValue("8");
  await expect(page.getByTestId("road-width-source").first()).toHaveText(
    /estimated from road type — check on site/,
  );
  await expect(page.getByTestId("station-detected")).toHaveText(/^Asok · BTS Sukhumvit Line/);
  await expect(station(page)).not.toHaveValue("");
  await expect(page.getByTestId("input-status")).toHaveText(/ready for the rules check/);

  await station(page).fill("300");
  await expect(page.getByRole("button", { name: "Use detected" })).toBeVisible();
  await page.getByRole("button", { name: "Use detected" }).click();
  await expect(station(page)).not.toHaveValue("300");
});

test("a plot outside the study area says to mark roads by hand", async ({ page }) => {
  await openMap(page);
  await page.evaluate(() =>
    (window as unknown as { __envelopeMap: TestMap }).__envelopeMap.jumpTo({
      center: [100.5772, 13.74],
      zoom: 17,
    }),
  );
  await settled(page);
  await drawPlot(page, [
    [100.5769, 13.7398],
    [100.5773, 13.7398],
    [100.5773, 13.7402],
    [100.5769, 13.7402],
  ]);
  await expect(page.getByTestId("site-status")).toHaveText(
    "Site data covers Asok–Sukhumvit (about 3 × 2.7 km). Outside it, mark roads and the station distance yourself.",
  );
  await expect(station(page)).toHaveValue("");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __envelopeMap: { queryRenderedFeatures(o: { layers: string[] }): unknown[] };
            }
          ).__envelopeMap.queryRenderedFeatures({ layers: ["site-study-area-line"] }).length,
      ),
    )
    .toBeGreaterThan(0);
  await expect(page.getByTestId("input-status")).toHaveText(/Mark at least one side/);
});

test("a plot too large for site data says so, without an error or a Retry", async ({ page }) => {
  await openMap(page);
  await page.evaluate(() =>
    (window as unknown as { __envelopeMap: TestMap }).__envelopeMap.jumpTo({
      center: [100.555, 13.7355],
      zoom: 15,
    }),
  );
  await settled(page);
  await drawPlot(page, [
    [100.552, 13.733],
    [100.558, 13.733],
    [100.558, 13.738],
    [100.552, 13.738],
  ]);
  const notice = page.getByTestId("site-status");
  await expect(notice).toHaveText(
    "Roads and stations are looked up only for plots within about 500 m. Mark roads and the station distance yourself, or draw a smaller plot.",
  );
  await expect(notice.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(station(page)).toHaveValue("");
});

test("a failed site request leaves the plot usable and can be retried", async ({ page }) => {
  await page.route("**/api/site/plot-context", (route) =>
    route.fulfill({ status: 500, body: "{}" }),
  );
  await page.goto("/");
  await openSiteStep(page);
  const notice = page.getByTestId("site-status");
  await expect(notice).toContainText(
    "Couldn't load site data. Your plot still works; mark roads by hand.",
  );
  await expect(page.getByTestId("input-status")).toHaveText(/ready for the rules check/);
  await page.unroute("**/api/site/plot-context");
  await notice.getByRole("button", { name: "Retry" }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.getByTestId("road-suggestion")).toBeVisible();
});
