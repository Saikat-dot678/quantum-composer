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

// The Composer's circuit canvas is a pannable/zoomable SVG (lib/canvasGeometry.ts),
// not a DOM grid of buttons: cells have no accessible name to click by, and
// the pixel position of a given (qubit, moment) cell depends on the live
// pan/zoom transform (which zoomToFit() changes on mount based on viewport
// size). This reads the actual transform off the DOM and inverts it, so
// tests click the correct cell regardless of current zoom/pan.
export async function circuitCellPoint(page: Page, qubit: number, moment: number): Promise<{ x: number; y: number }> {
  return page.evaluate(({ qubit, moment }) => {
    const CELL = { width: 64, height: 56 };
    const GUTTER = { left: 96, top: 40 };
    const app = document.querySelector('[role="application"]') as HTMLElement;
    const g = app.querySelector("svg > g") as SVGGElement;
    const transform = g.getAttribute("transform") ?? "";
    const scaleMatch = transform.match(/scale\(([^)]+)\)/);
    const translateMatch = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
    const zoom = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
    const tx = translateMatch ? parseFloat(translateMatch[1]) : 0;
    const ty = translateMatch ? parseFloat(translateMatch[2]) : 0;
    const canvasX = GUTTER.left + moment * CELL.width + CELL.width / 2;
    const canvasY = GUTTER.top + qubit * CELL.height + CELL.height / 2;
    const rect = app.getBoundingClientRect();
    return {
      x: rect.left + (canvasX - -tx) * zoom,
      y: rect.top + (canvasY - -ty) * zoom,
    };
  }, { qubit, moment });
}

/** Click an empty (or occupied, to select it) canvas cell at (qubit, moment). */
export async function clickCircuitCell(page: Page, qubit: number, moment: number): Promise<void> {
  const point = await circuitCellPoint(page, qubit, moment);
  await page.mouse.click(point.x, point.y);
}

/** Reads "Xq · Y ops" style text from the Composer canvas toolbar's status badge. */
export function workspaceStatus(page: Page) {
  return page.locator('[aria-label="Workspace status"]');
}

/** Reads "{project name} · {save state}" from the global TopBar. */
export function projectStatus(page: Page) {
  return page.locator('[aria-label="Project status"]');
}
