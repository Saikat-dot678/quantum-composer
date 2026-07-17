import { expect, test } from "@playwright/test";
import { BELL_OPS, enableStateAnalysis, gotoSimulatorWithCircuit, runAndOpenQuantumState, selectEngineLane } from "./stateAnalysisHelpers";

async function measureDock(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const dock = document.querySelector('[aria-labelledby="result-dock-heading"]');
    const content = dock?.querySelector(".overflow-y-auto");
    if (!content) return null;
    const rect = content.getBoundingClientRect();
    return { visibleHeight: Math.round(rect.height), scrollHeight: content.scrollHeight };
  });
}

test("expand button grows the dock at 1280x720", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 0, operations: BELL_OPS });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);
  await page.getByRole("button", { name: "Bloch" }).click();
  await page.waitForTimeout(300);

  const before = await measureDock(page);
  console.log("BEFORE EXPAND:", JSON.stringify(before));
  await page.getByRole("button", { name: /Expand the results dock/ }).click();
  await page.waitForTimeout(300);
  const after = await measureDock(page);
  console.log("AFTER EXPAND:", JSON.stringify(after));
  expect(after!.visibleHeight).toBeGreaterThan(before!.visibleHeight * 1.8);
  await page.screenshot({ path: "verify-expanded-1280x720.png", fullPage: false });

  await page.getByRole("button", { name: /Restore the results dock/ }).click();
  await page.waitForTimeout(300);
  const restored = await measureDock(page);
  expect(restored!.visibleHeight).toBeLessThan(after!.visibleHeight);
});

test("mobile dock content is no longer trapped in an inner 40vh scroller", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 0, operations: BELL_OPS });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);
  await page.getByRole("button", { name: "Bloch" }).click();
  await page.waitForTimeout(300);
  const dock = await measureDock(page);
  console.log("MOBILE DOCK:", JSON.stringify(dock));
  // The content div should now grow to its scroll height (page scrolls instead).
  expect(dock!.visibleHeight).toBeGreaterThanOrEqual(dock!.scrollHeight - 4);
  // And the Bloch sphere itself must be reachable by scrolling the PAGE.
  const sphere = page.locator("figure svg").first();
  await sphere.scrollIntoViewIfNeeded();
  await expect(sphere).toBeVisible();
  await page.screenshot({ path: "verify-mobile-bloch.png", fullPage: false });
});
