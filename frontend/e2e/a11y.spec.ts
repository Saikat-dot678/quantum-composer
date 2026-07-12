import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { openCommandPalette, openProjectsDrawer } from "./helpers";

// Automated accessibility scans (axe-core, WCAG 2.x A/AA rule tags) on every
// route, plus the two global overlays. Scans run against the production build
// with the backend offline — the same honest baseline as the smoke suite.

const ROUTES = ["/composer", "/simulator", "/crypto"] as const;

for (const route of ROUTES) {
  test(`axe: ${route} has no serious or critical violations`, async ({ page }) => {
    await page.goto(route);
    // Let async panels settle into their offline/error states before scanning.
    await page.waitForTimeout(600);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter((violation) =>
      violation.impact === "serious" || violation.impact === "critical",
    );
    expect(
      blocking.map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length} nodes)`),
    ).toEqual([]);
  });
}

test("axe: command palette overlay", async ({ page }) => {
  await page.goto("/composer");
  await openCommandPalette(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const blocking = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical",
  );
  expect(blocking.map((violation) => violation.id)).toEqual([]);
});

test("axe: projects drawer overlay", async ({ page }) => {
  await page.goto("/composer");
  await openProjectsDrawer(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const blocking = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical",
  );
  expect(blocking.map((violation) => violation.id)).toEqual([]);
});
