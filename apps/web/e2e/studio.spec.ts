import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

type DeckView = { designId: string | null };
type TestWindow = {
  __envelopeMap?: { isStyleLoaded(): boolean };
  __envelopeDeck?: { layers(): { id: string }[]; view(): DeckView };
};

async function openOptions(page: Page) {
  await page.goto("/");
  await page.waitForFunction(
    () => (window as unknown as TestWindow).__envelopeMap?.isStyleLoaded(),
    null,
    { timeout: 90_000 },
  );
  await expect(page.getByTestId("option-podium-tower")).toBeVisible({ timeout: 30_000 });
}

const deckDesign = (page: Page) =>
  page.evaluate(() => (window as unknown as TestWindow).__envelopeDeck?.view().designId ?? null);

/** Customises option B and waits for the variant's first build. */
async function customiseB(page: Page) {
  await page.getByTestId("option-podium-tower").click();
  await page.getByRole("tab", { name: "Customise" }).click();
  await page.getByRole("button", { name: "Customise B" }).click();
  const editor = page.getByTestId("studio-editor");
  await expect(editor).toBeVisible();
  await expect(page.getByTestId("metrics-strip")).toBeVisible();
  const id = await editor.getAttribute("data-variant");
  if (!id) throw new Error("no variant id");
  return { editor, id };
}

const metric = (page: Page, name: string) => page.getByTestId(`metric-${name}-value`);

test("customising B and setting floors 8–12 to offices updates the figures and the map", async ({
  page,
}) => {
  await openOptions(page);
  const { editor, id } = await customiseB(page);
  await expect(page.getByTestId(`option-${id}`)).toHaveAttribute("data-badge", "B1");
  await expect.poll(() => deckDesign(page)).toBe(id);

  const parkingBefore = await metric(page, "parking").textContent();
  const keysBefore = await metric(page, "keys").textContent();
  await editor.getByLabel("Select floors by number").fill("8-12");
  await editor.getByRole("button", { name: "Select", exact: true }).click();
  await expect(editor.getByTestId("selection-label")).toHaveText(/Floors 8–12/);

  await editor.getByRole("combobox", { name: "Use of the selected floors" }).click();
  await page.getByRole("option", { name: "Office" }).click();

  const offices = editor.getByTestId("section-group").filter({ hasText: "5 × Office" });
  await expect(offices).toHaveCount(1);
  await expect(offices).toContainText(/[\d,]+ m²/);
  // Fewer homes; parking is re-measured (here the 1 per 120 m² floor of MR 7 still governs).
  await expect(metric(page, "keys")).not.toHaveText(keysBefore ?? "");
  await expect(metric(page, "parking")).toHaveText(/^\d+ \/ \d+$/);
  await page.getByRole("tab", { name: "Cost" }).click();
  await expect(page.getByTestId("cost-tab")).toContainText("Office");
  await page.getByRole("tab", { name: "Customise" }).click();
  await expect(page.getByTestId(`compare-${id}`)).toContainText("m²");

  // One action, one undo step.
  await editor.getByRole("button", { name: "History" }).click();
  await expect(page.getByTestId("history-list")).toContainText("Residential → Office");
  await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Undo" }).click();
  await expect(editor.getByTestId("section-group").filter({ hasText: "Office" })).toHaveCount(0);
  await expect(metric(page, "parking")).toHaveText(parkingBefore ?? "");
  await expect.poll(() => deckDesign(page)).toBe(id);
});

test("a tower wider than the envelope with fitting off fails the envelope check, highlighted", async ({
  page,
}) => {
  await openOptions(page);
  const { editor } = await customiseB(page);
  await editor.getByRole("switch", { name: "Fit to the envelope" }).click();
  // Unfitted, the podium fills the plot: the flip is reported as soon as it happens.
  await expect(editor.getByTestId("what-changed")).toContainText(
    "Every floor inside the envelope now fails",
  );
  const width = editor.getByLabel("Tower width", { exact: true }).first();
  await width.fill("90");
  await width.blur();

  await expect(editor.getByTestId("tower-controls")).toHaveAttribute("data-invalid", "true");
  await expect(editor.getByTestId("fit-switch")).toHaveAttribute("data-invalid", "true");
  await expect(
    editor
      .getByTestId("control-fail")
      .filter({ hasText: "outside the high-rise envelope" })
      .first(),
  ).toBeVisible();
  await expect(
    editor
      .locator("[data-testid=floor-row][data-breach], [data-testid=floor-group-row][data-breach]")
      .first(),
  ).toBeVisible();
  await expect(page.getByTestId("checklist-chip")).not.toContainText("0 fail");

  await page.getByTestId("checklist-chip").click();
  const fit = page.getByTestId("checklist").first().getByTestId("check-envelope.fit").first();
  await expect(fit).toHaveAttribute("data-status", "fail");
});

test("undo and redo work from the keyboard", async ({ page }) => {
  await openOptions(page);
  const { editor } = await customiseB(page);
  const before = await metric(page, "height").textContent();
  await editor.getByLabel("Select floors by number").fill("22");
  await editor.getByRole("button", { name: "Select", exact: true }).click();
  await editor.getByRole("button", { name: "Add floor above" }).click();
  await expect(metric(page, "height")).not.toHaveText(before ?? "");
  const after = await metric(page, "height").textContent();

  await page.getByTestId("metrics-strip").click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(metric(page, "height")).toHaveText(before ?? "");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(metric(page, "height")).toHaveText(after ?? "");
});

test("a variant survives a reload", async ({ page }) => {
  await openOptions(page);
  const { editor, id } = await customiseB(page);
  const name = editor.getByLabel("Variant name");
  await name.fill("Taller tower study");
  await name.press("Enter");
  await expect(page.getByTestId(`option-${id}`)).toContainText("Taller tower study");
  await page.waitForTimeout(600);

  await page.reload();
  await expect(page.getByTestId(`option-${id}`)).toContainText("Taller tower study", {
    timeout: 60_000,
  });
  await page.getByTestId(`option-${id}`).click();
  await page.getByRole("tab", { name: "Customise" }).click();
  await expect(page.getByTestId("studio-editor")).toHaveAttribute("data-variant", id);
});

test("selecting a comparison row selects the option", async ({ page }) => {
  await openOptions(page);
  await page.getByTestId("compare-midrise").click();
  await expect(page.getByTestId("option-midrise")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => deckDesign(page)).toBe("midrise");
  await page.getByRole("button", { name: "Hide" }).click();
  await expect(page.getByTestId("design-comparison")).toHaveCount(0);
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByTestId("design-comparison")).toBeVisible();
});

test("the floor schedule downloads as CSV and the summary prints", async ({ page }) => {
  await openOptions(page);
  await page.getByTestId("option-podium-tower").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Floor schedule (CSV)" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("podium-tower-floors.csv");
  const path = await download.path();
  const csv = await readFile(path, "utf8");
  expect(csv).toContain("Floor,Use,Bottom (m)");
  expect(csv).toMatch(/\r\nTotal,/);

  await page.emulateMedia({ media: "print" });
  const summary = page.getByTestId("print-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("Podium + tower");
  await expect(summary).toContainText("An architect must check and sign");
  await expect(summary.getByTestId("print-figures")).toContainText("Left for land");
  await expect(summary.getByTestId("checklist")).toBeVisible();
  await expect(page.getByTestId("left-column")).toBeHidden();
});

test("cost and return show the land verdict, and assumptions can be changed and reset", async ({
  page,
}) => {
  await openOptions(page);
  await page.getByTestId("option-podium-tower").click();
  await page.getByRole("tab", { name: "Cost" }).click();
  await expect(page.getByTestId("cost-total")).toHaveText(/^฿/);
  await page.getByRole("tab", { name: "Return" }).click();
  const verdict = page.getByTestId("land-verdict");
  await expect(verdict).toHaveText(/^Short of land by ฿/);

  await page.getByTestId("assumptions").getByText("Condo sales").click();
  const price = page.getByLabel("Sale price");
  await price.fill("420000");
  await expect(verdict).toHaveText("Covers land");
  await expect(page.getByTestId("assumptions")).toContainText("1 changed");

  await page.reload();
  await page.getByTestId("option-podium-tower").click({ timeout: 60_000 });
  await page.getByRole("tab", { name: "Return" }).click();
  await expect(page.getByTestId("land-verdict")).toHaveText("Covers land");
  await page.getByRole("button", { name: "Reset all" }).click();
  await expect(page.getByTestId("land-verdict")).toHaveText(/^Short of land by/);
});
