import { expect, test } from "@playwright/test";

async function backendAvailable(): Promise<boolean> {
  try { return (await fetch("http://localhost:8000/health")).ok; } catch { return false; }
}

test.beforeEach(async () => {
  test.skip(!!process.env.CI, "Hardware screenshot baselines are platform-specific.");
  test.skip(!(await backendAvailable()), "Backend is required for hardware screenshot baselines.");
});

test("hardware backend browser and topology", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/hardware");
  await expect(page.getByRole("img", { name: /coupling topology/ })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveScreenshot("hardware-backend-topology.png", { fullPage: true, animations: "disabled" });
});

test("mapped circuit and backend comparison", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/hardware");
  await page.getByLabel("Initial layout").fill("0,4");
  await page.getByRole("button", { name: "Transpile and map", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Logical-to-physical layout" })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveScreenshot("hardware-mapped-circuit.png", {
    fullPage: true,
    animations: "disabled",
    mask: [page.getByText(/ms transpilation/)],
  });

  await page.getByRole("button", { name: "Add to comparison" }).click();
  await page.getByLabel("Generic topology").selectOption("ring");
  await page.getByRole("button", { name: "Load generic target" }).click();
  await expect(page.getByRole("heading", { name: /generic_ring_5q topology/i })).toBeVisible();
  await page.getByRole("button", { name: "Add to comparison" }).click();
  await page.getByRole("button", { name: "Compare selected" }).click();
  await expect(page.getByRole("heading", { name: "Backend comparison" })).toBeVisible({ timeout: 45_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  await expect(page).toHaveScreenshot("hardware-comparison.png", { fullPage: true, animations: "disabled" });
});

test("mobile hardware workflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/hardware");
  await expect(page.getByRole("heading", { name: "Trace a logical circuit onto a physical target" })).toBeVisible();
  await expect(page.getByRole("img", { name: /coupling topology/ })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveScreenshot("hardware-mobile.png", { fullPage: true, animations: "disabled" });
});
