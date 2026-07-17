import { expect, test, type Page } from "@playwright/test";

const REQUIRED_VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 820, height: 1180 },
  { width: 768, height: 1024 },
  { width: 430, height: 932 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
  { width: 844, height: 390 },
] as const;

const ROUTES = ["/composer", "/simulator", "/crypto", "/hardware"] as const;

async function documentWidth(page: Page) {
  return page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
}

for (const route of ROUTES) {
  test(`${route} has no document-level horizontal overflow at every required viewport`, async ({ page }) => {
    for (const viewport of REQUIRED_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto(route);
      await page.waitForTimeout(150);
      const size = await documentWidth(page);
      expect.soft(
        size.documentWidth,
        `${route} overflowed at ${viewport.width}x${viewport.height}`,
      ).toBeLessThanOrEqual(size.viewportWidth + 1);
    }
  });
}

test("workspace shells reflow without document overflow at 80-200% layout zoom", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  for (const route of ROUTES) {
    await page.goto(route);
    for (const zoom of [0.8, 1, 1.25, 1.5, 2]) {
      await page.evaluate((value) => { document.documentElement.style.zoom = String(value); }, zoom);
      await page.waitForTimeout(100);
      const size = await documentWidth(page);
      expect.soft(size.documentWidth, `${route} overflowed at ${zoom * 100}% layout zoom`).toBeLessThanOrEqual(size.viewportWidth + 1);
    }
  }
});

for (const viewport of [
  { width: 768, height: 1024 },
  { width: 430, height: 932 },
  { width: 360, height: 800 },
]) {
  test(`custom-gate wizard remains inside ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/composer");
    const gatesTab = page.getByRole("button", { name: "Gates", exact: true });
    await expect(gatesTab).toBeVisible({ timeout: 15_000 });
    await gatesTab.click();
    const gateSheet = page.getByRole("dialog", { name: "Gate library" });
    await expect(gateSheet).toBeVisible();
    const createButton = gateSheet.getByRole("button", { name: "Create a new custom gate or operation" });
    await expect(createButton).toBeVisible();
    await createButton.click();
    const dialog = page.getByRole("dialog", { name: "New gate or operation" });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(350);
    const bounds = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    });
    expect(bounds.top).toBeGreaterThanOrEqual(-1);
    expect(bounds.left).toBeGreaterThanOrEqual(-1);
    expect(bounds.bottom).toBeLessThanOrEqual(viewport.height + 1);
    expect(bounds.right).toBeLessThanOrEqual(viewport.width + 1);
    await dialog.getByRole("button", { name: "Close" }).click();
  });
}
