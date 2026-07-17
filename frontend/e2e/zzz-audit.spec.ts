import { test } from "@playwright/test";
import { BELL_OPS, enableStateAnalysis, gotoSimulatorWithCircuit, runAndOpenQuantumState, selectEngineLane } from "./stateAnalysisHelpers";

// Phase-1 audit capture: record the INITIAL condition (before fixes) at the
// problem viewports. Throwaway -- not part of the committed suite.

const SIZES = [
  { width: 1366, height: 768, tag: "1366x768" },
  { width: 1280, height: 720, tag: "1280x720" },
  { width: 1024, height: 768, tag: "1024x768" },
  { width: 768, height: 1024, tag: "768x1024" },
  { width: 360, height: 800, tag: "360x800" },
];

test.describe("audit: simulator state result at short/narrow viewports", () => {
  for (const size of SIZES.slice(0, 3)) {
    test(`bloch view @ ${size.tag}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 0, operations: BELL_OPS });
      await selectEngineLane(page, "SV");
      await enableStateAnalysis(page);
      await runAndOpenQuantumState(page);
      await page.getByRole("button", { name: "Bloch" }).click();
      await page.waitForTimeout(300);
      // Measure the actual visible height of the result content area.
      const dockInfo = await page.evaluate(() => {
        const dock = document.querySelector('[aria-labelledby="result-dock-heading"]');
        const content = dock?.querySelector(".overflow-y-auto");
        if (!content) return null;
        const rect = content.getBoundingClientRect();
        return { visibleHeight: Math.round(rect.height), scrollHeight: content.scrollHeight, clipped: content.scrollHeight > rect.height + 4 };
      });
      console.log(`DOCK @ ${size.tag}:`, JSON.stringify(dockInfo));
      await page.screenshot({ path: `audit-${size.tag}-bloch.png`, fullPage: false });
    });
  }

  test("horizontal overflow check across routes @ 360x800", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    for (const route of ["/composer", "/simulator", "/crypto"]) {
      await page.goto(route);
      await page.waitForTimeout(700);
      const overflow = await page.evaluate(() => ({
        docWidth: document.documentElement.scrollWidth,
        winWidth: window.innerWidth,
        overflows: document.documentElement.scrollWidth > window.innerWidth + 1,
      }));
      console.log(`OVERFLOW ${route} @360:`, JSON.stringify(overflow));
      await page.screenshot({ path: `audit-360${route.replace("/", "-")}.png`, fullPage: false });
    }
  });

  test("crypto + composer wizard at 768x1024", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/crypto");
    await page.waitForTimeout(700);
    await page.screenshot({ path: "audit-768-crypto.png", fullPage: false });
    await page.goto("/composer");
    await page.waitForTimeout(500);
    // Below xl the gate dock is a mobile bottom sheet -- open it first.
    const gatesTab = page.getByRole("button", { name: "Gates", exact: true });
    if (await gatesTab.isVisible().catch(() => false)) {
      await gatesTab.click();
      await page.waitForTimeout(400);
    }
    await page.getByRole("button", { name: "Create a new custom gate or operation" }).click();
    await page.waitForTimeout(400);
    const dialogInfo = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return null;
      const rect = dialog.getBoundingClientRect();
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), winH: window.innerHeight, overflowsViewport: rect.bottom > window.innerHeight || rect.top < 0 };
    });
    console.log("WIZARD DIALOG @768x1024:", JSON.stringify(dialogInfo));
    await page.screenshot({ path: "audit-768-wizard.png", fullPage: false });
  });
});
