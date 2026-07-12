import { expect, type Page } from "@playwright/test";

// The routes are server-rendered before React hydrates, so a keypress fired
// immediately after `goto` can land before the global shortcut listener is
// attached. Retrying the trigger until the dialog appears is deterministic
// without hard-coded sleeps.
export async function openCommandPalette(page: Page): Promise<void> {
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(palette).toBeVisible({ timeout: 750 });
  }).toPass({ timeout: 10_000 });
}

export async function openProjectsDrawer(page: Page): Promise<void> {
  const drawer = page.getByRole("dialog", { name: /Projects/i });
  await expect(async () => {
    await page.getByRole("button", { name: "Open projects and recent circuits" }).click();
    await expect(drawer).toBeVisible({ timeout: 750 });
  }).toPass({ timeout: 10_000 });
}
