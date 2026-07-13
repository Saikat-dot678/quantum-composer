import { expect, test } from "@playwright/test";
import { clickCircuitCell, workspaceStatus } from "./helpers";

// Custom gate/operation creation, placement, and library management —
// backend-independent (everything here is local schema/validation/storage,
// see lib/customGates.ts, lib/customGateValidation.ts, lib/customGateRepository.ts).

test.beforeEach(async ({ page }) => {
  await page.goto("/composer");
  await expect(page.locator('[role="application"]')).toBeVisible();
  await page.waitForTimeout(400); // let zoomToFit settle before computing any pixel coordinates
  // Each test gets a clean custom-gate library — otherwise gates saved by an
  // earlier test (same origin, real localStorage under webServer reuse) leak in.
  await page.evaluate(() => window.localStorage.removeItem("quantum-composer.custom-gates.v1"));
  await page.reload();
  await expect(page.locator('[role="application"]')).toBeVisible();
  await page.waitForTimeout(400);
});

test("creates a matrix custom gate from a template, places it, and selects it", async ({ page }) => {
  await page.getByRole("button", { name: "Create a new custom gate or operation" }).click();
  const dialog = page.getByRole("dialog", { name: "New gate or operation" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Hadamard (matrix example)" }).click();
  await expect(dialog.getByText("This definition is valid and ready to save.")).toBeVisible();
  await dialog.getByRole("button", { name: "Create gate" }).click();
  await expect(dialog).toBeHidden();

  const chip = page.getByRole("button", { name: /^Hadamard \(matrix example\)\./ });
  await expect(chip).toBeVisible();
  await chip.click();

  await expect(workspaceStatus(page)).toContainText("2q · 4 ops");
  await clickCircuitCell(page, 0, 7);
  await expect(workspaceStatus(page)).toContainText("2q · 5 ops");

  await clickCircuitCell(page, 0, 7);
  await expect(page.locator("h3", { hasText: "Hadamard (matrix example)" })).toBeVisible();
  await expect(page.locator("p.font-mono", { hasText: "t7" })).toBeVisible();
});

test("rejects a non-unitary matrix with a clear reason and disables save", async ({ page }) => {
  await page.getByRole("button", { name: "Create a new custom gate or operation" }).click();
  const dialog = page.getByRole("dialog", { name: "New gate or operation" });
  await dialog.getByRole("button", { name: "Matrix", exact: false }).first().click();
  await dialog.getByLabel("Name").fill("Broken gate");
  await dialog.getByLabel("Canvas label").fill("BRK");

  await expect(dialog.getByText("This definition is valid and ready to save.")).toBeVisible();
  const saveButton = dialog.getByRole("button", { name: "Create gate" });
  await expect(saveButton).toBeEnabled();

  // Break unitarity: row 0 becomes [5, 0] instead of a unit vector.
  await dialog.getByLabel("Row 0 column 0 real part").fill("5");
  await expect(dialog.getByText(/not unitary within tolerance/)).toBeVisible();
  await expect(saveButton).toBeDisabled();
});

test("creates a Bell-pair composite from a template and places both operations atomically", async ({ page }) => {
  await page.getByRole("button", { name: "Create a new custom gate or operation" }).click();
  const dialog = page.getByRole("dialog", { name: "New gate or operation" });
  await dialog.getByRole("button", { name: "Bell pair" }).click();

  await expect(dialog.getByText(/2 operations from .Bell pair./)).toBeVisible();
  await expect(dialog.getByText("This definition is valid and ready to save.")).toBeVisible();
  await dialog.getByRole("button", { name: "Create gate" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: /^Bell pair\./ }).click();
  await clickCircuitCell(page, 0, 7);
  // A 2-qubit composite placed at q0 must occupy q0 AND q1 as one atomic block.
  await expect(workspaceStatus(page)).toContainText("2q · 5 ops");

  await clickCircuitCell(page, 0, 7);
  await expect(page.locator("h3", { hasText: "Bell pair" })).toBeVisible();
  await expect(page.locator("p.font-mono", { hasText: "q0 → q1" })).toBeVisible();

  await clickCircuitCell(page, 1, 7);
  await expect(page.locator("h3", { hasText: "Bell pair" })).toBeVisible();
});

test("custom gate placement is rejected (not silently overwritten) when the target is occupied", async ({ page }) => {
  // Occupy q1,t5 only, leaving q0,t5 empty — an anchor-free-but-span-conflicts
  // scenario the default preset's own layout doesn't have on its own (every
  // preset moment touches both q0 and q1 together).
  await page.getByRole("button", { name: /^Pauli X\./ }).click();
  await clickCircuitCell(page, 1, 5);
  await expect(workspaceStatus(page)).toContainText("2q · 5 ops");

  await page.getByRole("button", { name: "Create a new custom gate or operation" }).click();
  const dialog = page.getByRole("dialog", { name: "New gate or operation" });
  await dialog.getByRole("button", { name: "Bell pair" }).click();
  await dialog.getByRole("button", { name: "Create gate" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: /^Bell pair\./ }).click();
  // q0,t5 is empty (valid anchor) but the 2-qubit span also needs q1,t5,
  // which the X placed above already occupies.
  await clickCircuitCell(page, 0, 5);
  await expect(page.getByRole("status").filter({ hasText: /already occupied/ })).toBeVisible();
  await expect(workspaceStatus(page)).toContainText("2q · 5 ops");
});

test("expand preview shows the flattened operations for a composite instance", async ({ page }) => {
  await page.getByRole("button", { name: "Create a new custom gate or operation" }).click();
  const dialog = page.getByRole("dialog", { name: "New gate or operation" });
  await dialog.getByRole("button", { name: "Bell pair" }).click();
  await dialog.getByRole("button", { name: "Create gate" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: /^Bell pair\./ }).click();
  await clickCircuitCell(page, 0, 7);
  await clickCircuitCell(page, 0, 7);

  await page.getByRole("button", { name: "Expand preview" }).click();
  const preview = page.getByRole("dialog", { name: /Expanded view/ });
  await expect(preview).toBeVisible();
  await expect(preview.getByText("Flattened operations (2)")).toBeVisible();
  await expect(preview.getByText(/^H · q0/)).toBeVisible();
  await expect(preview.getByText(/^CX · q0,1/)).toBeVisible();
});

test("the custom gate library drawer lists, favorites, and deletes a saved gate", async ({ page }) => {
  await page.getByRole("button", { name: "Create a new custom gate or operation" }).click();
  const dialog = page.getByRole("dialog", { name: "New gate or operation" });
  await dialog.getByRole("button", { name: "Hadamard (matrix example)" }).click();
  await dialog.getByRole("button", { name: "Create gate" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Open the custom gate library" }).click();
  const drawer = page.getByRole("dialog", { name: "My Gates & My Operations" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Hadamard (matrix example)")).toBeVisible();

  await drawer.getByRole("button", { name: "Add to favorites" }).click();
  await drawer.getByRole("button", { name: "favorites", exact: true }).click();
  await expect(drawer.getByText("Hadamard (matrix example)")).toBeVisible();

  await drawer.getByRole("button", { name: "Delete" }).click();
  await drawer.getByRole("button", { name: "Confirm" }).click();
  await expect(drawer.getByText("No custom gates yet.")).toBeVisible();
  await drawer.getByRole("button", { name: "Close custom gate library" }).click();
});

test("a share link carrying a custom gate round-trips through a fresh session", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });

  await page.getByRole("button", { name: "Create a new custom gate or operation" }).click();
  const dialog = page.getByRole("dialog", { name: "New gate or operation" });
  await dialog.getByRole("button", { name: "Bell pair" }).click();
  await dialog.getByRole("button", { name: "Create gate" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: /^Bell pair\./ }).click();
  await clickCircuitCell(page, 0, 7);
  await expect(workspaceStatus(page)).toContainText("2q · 5 ops");

  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByRole("button", { name: /Link copied/ })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("/composer?c2=");

  // Simulate a recipient with no local custom-gate library at all.
  await page.evaluate(() => window.localStorage.removeItem("quantum-composer.custom-gates.v1"));
  await page.goto(copied);
  await expect(page.locator('[role="application"]')).toBeVisible();
  await page.waitForTimeout(400);

  await expect(workspaceStatus(page)).toContainText("2q · 5 ops");
  await clickCircuitCell(page, 0, 7);
  await expect(page.locator("h3", { hasText: "Bell pair" })).toBeVisible();

  await page.getByRole("button", { name: "Open the custom gate library" }).click();
  await expect(page.getByRole("dialog", { name: "My Gates & My Operations" }).getByText("Bell pair")).toBeVisible();
});

test("exporting and re-importing a circuit JSON file restores a placed custom gate", async ({ page }) => {
  await page.getByRole("button", { name: "Create a new custom gate or operation" }).click();
  const dialog = page.getByRole("dialog", { name: "New gate or operation" });
  await dialog.getByRole("button", { name: "Hadamard (matrix example)" }).click();
  await dialog.getByRole("button", { name: "Create gate" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: /^Hadamard \(matrix example\)\./ }).click();
  await clickCircuitCell(page, 0, 7);
  await expect(workspaceStatus(page)).toContainText("2q · 5 ops");

  await page.getByRole("button", { name: "Open projects and recent circuits" }).click();
  const drawer = page.getByRole("dialog", { name: /Projects/i });
  await expect(drawer).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await drawer.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const exportPath = await download.path();
  expect(exportPath).toBeTruthy();
  const fs = await import("node:fs/promises");
  const exported = await fs.readFile(exportPath!, "utf-8");
  expect(exported).toContain("quantum-composer-circuit");
  expect(exported).toContain("Hadamard (matrix example)");

  // Simulate a fresh session: no circuit, no custom-gate library.
  await page.evaluate(() => { window.localStorage.removeItem("quantum-composer.custom-gates.v1"); window.localStorage.removeItem("quantum-composer.workspace.v2"); });
  await drawer.getByRole("button", { name: "New blank" }).click();
  await expect(workspaceStatus(page)).toContainText("2q · 0 ops");

  await page.getByRole("button", { name: "Open projects and recent circuits" }).click();
  await expect(drawer).toBeVisible();
  const fileInput = page.getByLabel("Import circuit JSON");
  await fileInput.setInputFiles({ name: "circuit.json", mimeType: "application/json", buffer: Buffer.from(exported, "utf-8") });
  await expect(workspaceStatus(page)).toContainText("2q · 5 ops");

  await clickCircuitCell(page, 0, 7);
  await expect(page.locator("h3", { hasText: "Hadamard (matrix example)" })).toBeVisible();
});
