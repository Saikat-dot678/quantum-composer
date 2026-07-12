import { expect, test } from "@playwright/test";

// Backend-independent smoke checks: the shell, all three modes, the live
// telemetry strip, and the roving-grid keyboard behavior must work even when
// the FastAPI backend is offline.

test("shell renders with honest identity and telemetry", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Quantum Composer/);
  await expect(page.getByRole("heading", { name: "Quantum Composer" })).toBeVisible();
  // Live telemetry strip reflects the default Bell preset.
  const status = page.locator('[aria-label="Application status"]');
  await expect(status).toContainText("Structured large circuits only");
  await expect(status).toContainText("Clifford");
});

test("mode navigation reaches all three labs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Simulator Lab", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Feasibility-first execution bench" })).toBeVisible();
  await page.getByRole("button", { name: "Cryptography Lab" }).click();
  await expect(page.getByRole("heading", { name: "Protocol analysis workspace" })).toBeVisible();
  await page.getByRole("button", { name: "Composer", exact: true }).click();
  await expect(page.getByRole("grid", { name: "Quantum circuit timeline" })).toBeVisible();
});

test("circuit grid supports roving arrow-key navigation", async ({ page }) => {
  await page.goto("/");
  const grid = page.getByRole("grid", { name: "Quantum circuit timeline" });
  await expect(grid).toBeVisible();
  // Focus the roving tab stop (the single cell with tabindex=0).
  const start = grid.locator('button[tabindex="0"]');
  await start.focus();
  await expect(start).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const focused = page.locator("button:focus");
  await expect(focused).toHaveAttribute("aria-label", /time step 1/);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("button:focus")).toHaveAttribute("aria-label", /q1/);
});

test("live state preview reacts to the default circuit", async ({ page }) => {
  await page.goto("/");
  const preview = page.locator("section", { has: page.getByRole("heading", { name: "Live state preview" }) });
  await expect(preview).toBeVisible();
  // Default Bell preset: two basis states at ~50% each.
  await expect(preview).toContainText("|00⟩");
  await expect(preview).toContainText("|11⟩");
});
