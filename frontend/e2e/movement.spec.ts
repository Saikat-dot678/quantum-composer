import { expect, test } from "@playwright/test";
import { clickCircuitCell, workspaceStatus } from "./helpers";

async function cellPoint(page: import("@playwright/test").Page, qubit: number, moment: number) {
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
    return { x: rect.left + (canvasX - -tx) * zoom, y: rect.top + (canvasY - -ty) * zoom };
  }, { qubit, moment });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/composer");
  await expect(page.locator('[role="application"]')).toBeVisible();
  await page.waitForTimeout(400); // let zoomToFit settle before computing any pixel coordinates
});

test("dragging a placed gate to an empty cell moves it", async ({ page }) => {
  await expect(workspaceStatus(page)).toContainText("2q · 4 ops");

  // Place an H at q0,t7 (empty in the default Bell preset).
  await page.getByRole("button", { name: /^Hadamard\./ }).click();
  await clickCircuitCell(page, 0, 7);
  await expect(workspaceStatus(page)).toContainText("2q · 5 ops");

  const from = await cellPoint(page, 0, 7);
  const to = await cellPoint(page, 1, 6);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();

  // Op count must stay the same (a move, not a delete+add or a duplicate).
  await expect(workspaceStatus(page)).toContainText("2q · 5 ops");

  // The moved gate should now be selectable at the new cell — target the
  // inspector's own metadata line specifically (the toast and the wire
  // labels also contain "q1"/"t6" text, so an unscoped match is ambiguous).
  await clickCircuitCell(page, 1, 6);
  await expect(page.getByText("Selected operation", { exact: true })).toBeVisible();
  await expect(page.locator("p.font-mono", { hasText: "t6" })).toContainText("q1");
});

test("dragging onto an occupied cell cancels rather than overwriting", async ({ page }) => {
  const opsBefore = await page.evaluate(() => document.body.textContent?.match(/(\d+)\s*q[^\d]*?(\d+)\s*ops/)?.[2]);

  // q0,t0 (H) dragged onto q0,t1 (CX control) — a clean occupied-cell conflict.
  const from = await cellPoint(page, 0, 0);
  const to = await cellPoint(page, 0, 1);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await expect(page.getByText(/already occupied/)).toBeVisible();
  await page.mouse.up();

  const opsAfter = await page.evaluate(() => document.body.textContent?.match(/(\d+)\s*q[^\d]*?(\d+)\s*ops/)?.[2]);
  expect(opsAfter).toBe(opsBefore);
});

test("Escape cancels an in-progress drag", async ({ page }) => {
  await expect(workspaceStatus(page)).toContainText("2q · 4 ops");

  const from = await cellPoint(page, 0, 0); // H gate
  const to = await cellPoint(page, 1, 7); // empty, valid target

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.keyboard.press("Escape");
  await page.mouse.up();

  // Nothing should have moved — op count and the original cell's occupant unchanged.
  await expect(workspaceStatus(page)).toContainText("2q · 4 ops");
  await clickCircuitCell(page, 0, 0);
  await expect(page.getByText("Selected operation", { exact: true })).toBeVisible();
  await expect(page.getByText("Hadamard", { exact: true })).toBeVisible();
});

test("keyboard move mode: select, M, arrow keys, Enter confirms", async ({ page }) => {
  const canvas = page.locator('[role="application"]');

  // Select the H gate at q0,t0 by clicking it, then focus canvas and press M.
  await clickCircuitCell(page, 0, 0);
  await expect(page.getByText("Selected operation", { exact: true })).toBeVisible();
  await canvas.focus();
  await page.keyboard.press("m");

  const banner = page.getByText(/Moving H/);
  await expect(banner).toBeVisible();

  // Move to a clean free column further right.
  for (let i = 0; i < 7; i += 1) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");

  await expect(banner).not.toBeVisible();
  await expect(workspaceStatus(page)).toContainText("2q · 4 ops"); // still 4: a move, not an add
});

test("keyboard move mode: Escape cancels without changing the circuit", async ({ page }) => {
  const canvas = page.locator('[role="application"]');
  await clickCircuitCell(page, 0, 0);
  await expect(page.getByText("Selected operation", { exact: true })).toBeVisible();
  await canvas.focus();
  await page.keyboard.press("m");
  await expect(page.getByText(/Moving H/)).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(page.getByText(/Moving H/)).not.toBeVisible();

  // Still selected at the original cell, unchanged.
  await expect(page.getByText("Selected operation", { exact: true })).toBeVisible();
  await expect(page.locator("p.font-mono", { hasText: "t0" })).toContainText("q0");
});

test("moving a two-qubit gate keeps control/target together", async ({ page }) => {
  // CX sits at q0-q1, t1 in the default preset. Select it.
  await clickCircuitCell(page, 0, 1);
  await expect(page.getByText("Selected operation", { exact: true })).toBeVisible();
  await expect(page.getByText("Controlled X", { exact: true })).toBeVisible();

  const canvas = page.locator('[role="application"]');
  await canvas.focus();
  await page.keyboard.press("m");
  for (let i = 0; i < 5; i += 1) await page.keyboard.press("ArrowRight"); // slide to a free column
  await page.keyboard.press("Enter");

  await expect(workspaceStatus(page)).toContainText("2q · 4 ops");
  // Re-select at the new column and confirm it's still a 2-qubit CX spanning q0-q1.
  await clickCircuitCell(page, 0, 6);
  await expect(page.getByText("Controlled X", { exact: true })).toBeVisible();
  await expect(page.getByText(/q0 → q1/)).toBeVisible();
});
