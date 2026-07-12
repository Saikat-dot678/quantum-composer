import { expect, test } from "@playwright/test";

// Visual regression snapshots for the three routes at desktop and phone
// widths. Baselines are rendered on the development machine (Windows); pixel
// rendering differs across OSes, so these are skipped in CI and act as a
// local regression net. Refresh baselines with:
//   npx playwright test e2e/visual.spec.ts --update-snapshots
test.skip(!!process.env.CI, "Screenshot baselines are platform-specific; run locally.");

const ROUTES: Array<{ path: string; name: string }> = [
  { path: "/composer", name: "composer" },
  { path: "/simulator", name: "simulator" },
  { path: "/crypto", name: "crypto" },
];

const VIEWPORTS = [
  { width: 1280, height: 800, tag: "desktop" },
  { width: 390, height: 844, tag: "phone" },
];

for (const { path, name } of ROUTES) {
  for (const viewport of VIEWPORTS) {
    test(`${name} @ ${viewport.tag}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(path);
      await page.waitForTimeout(700); // allow offline states + fonts to settle
      await expect(page).toHaveScreenshot(`${name}-${viewport.tag}.png`, {
        fullPage: false,
        maxDiffPixelRatio: 0.02,
        animations: "disabled",
      });
    });
  }
}
