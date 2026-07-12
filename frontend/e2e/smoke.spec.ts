import { deflateRawSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { openCommandPalette, openProjectsDrawer } from "./helpers";

// Backend-independent smoke checks for the workbench: shell + telemetry,
// rail navigation, deep links, compressed and legacy share links, undo/redo,
// the command palette (including registered Composer actions), the projects
// drawer, roving grid keys, and the local state preview.

function encodeLegacy(circuit: unknown): string {
  return Buffer.from(JSON.stringify(circuit), "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeCompressed(circuit: unknown): string {
  return deflateRawSync(Buffer.from(JSON.stringify(circuit), "utf-8")).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const SHARED_CIRCUIT = {
  num_qubits: 3,
  num_clbits: 0,
  shots: 512,
  operations: [{ gate: "h", qubits: [0], clbits: [], params: {}, moment: 0 }],
};

const statusChip = (page: import("@playwright/test").Page) => page.locator('[aria-label="Workspace status"]');

test("root redirects to the composer with live telemetry in the console header", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/composer$/);
  await expect(page).toHaveTitle(/Quantum Composer/);
  await expect(statusChip(page)).toContainText("2q · 4 ops · Clifford");
  await expect(page.getByRole("heading", { name: "Circuit Composer" })).toBeVisible();
});

test("activity rail navigates between routes", async ({ page }) => {
  await page.goto("/composer");
  const rail = page.getByRole("navigation", { name: "Workbench" });
  await rail.getByRole("button", { name: "Simulate" }).click();
  await expect(page).toHaveURL(/\/simulator$/);
  await expect(page.getByRole("heading", { name: "Simulator Lab" })).toBeVisible();
  await rail.getByRole("button", { name: "Crypto" }).click();
  await expect(page).toHaveURL(/\/crypto$/);
  await expect(page.getByRole("heading", { name: "Protocol analysis workspace" })).toBeVisible();
  await rail.getByRole("button", { name: "Compose" }).click();
  await expect(page).toHaveURL(/\/composer$/);
  await expect(page.getByRole("grid", { name: "Quantum circuit timeline" })).toBeVisible();
});

test("labs are directly deep-linkable", async ({ page }) => {
  await page.goto("/simulator");
  await expect(page.getByRole("heading", { name: "Simulator Lab" })).toBeVisible();
  await page.goto("/crypto");
  await expect(page.getByRole("heading", { name: "Protocol analysis workspace" })).toBeVisible();
});

test("a compressed ?c2= link reproduces the encoded circuit", async ({ page }) => {
  await page.goto(`/composer?c2=${encodeCompressed(SHARED_CIRCUIT)}`);
  await expect(statusChip(page)).toContainText("3q · 1 ops");
  await expect(page).toHaveURL(/\/composer$/); // parameter consumed and stripped
});

test("a legacy ?c= link still decodes (backward compatibility)", async ({ page }) => {
  await page.goto(`/composer?c=${encodeLegacy(SHARED_CIRCUIT)}`);
  await expect(statusChip(page)).toContainText("3q · 1 ops");
});

test("an invalid share link is rejected with an explanatory toast", async ({ page }) => {
  await page.goto("/composer?c2=not-a-real-payload");
  await expect(page.getByRole("status").filter({ hasText: "shared link is invalid" })).toBeVisible();
  await expect(statusChip(page)).toContainText("2q · 4 ops");
});

test("the share button copies a compressed link that round-trips", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  await page.goto("/composer");
  await page.getByRole("button", { name: "Share link" }).click();
  await expect(page.getByRole("button", { name: /Link copied/ })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("/composer?c2=");
  await page.goto(copied);
  await expect(statusChip(page)).toContainText("2q · 4 ops");
});

test("placing a gate is undoable with Ctrl+Z", async ({ page }) => {
  await page.goto("/composer");
  await expect(statusChip(page)).toContainText("2q · 4 ops");
  await page.getByRole("button", { name: "Place H on q0 at time step 3" }).click();
  await expect(statusChip(page)).toContainText("2q · 5 ops");
  await page.keyboard.press("Control+z");
  await expect(statusChip(page)).toContainText("2q · 4 ops");
  await page.keyboard.press("Control+y");
  await expect(statusChip(page)).toContainText("2q · 5 ops");
});

test("command palette exposes registered Composer actions and navigates", async ({ page }) => {
  await page.goto("/composer");
  await openCommandPalette(page);
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await page.getByRole("combobox", { name: "Search commands" }).fill("run current");
  await expect(palette.getByRole("option", { name: /Run current circuit/ })).toBeVisible();
  await page.getByRole("combobox", { name: "Search commands" }).fill("cryptography");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/crypto$/);
});

test("projects: save, autosave binding, and recent-project reopening", async ({ page }) => {
  await page.goto("/composer");
  await openProjectsDrawer(page);
  const drawer = page.getByRole("dialog", { name: /Projects/i });
  await drawer.getByLabel("Name current circuit").fill("E2E Bell");
  await drawer.getByRole("button", { name: "Save as" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved “E2E Bell”" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(statusChip(page)).toContainText("E2E Bell");
  // The palette lists it as a recent project.
  await openCommandPalette(page);
  await page.getByRole("combobox", { name: "Search commands" }).fill("E2E Bell");
  await expect(page.getByRole("option", { name: /Open recent: E2E Bell/ })).toBeVisible();
});

test("circuit grid supports roving arrow-key navigation", async ({ page }) => {
  await page.goto("/composer");
  const grid = page.getByRole("grid", { name: "Quantum circuit timeline" });
  await expect(grid).toBeVisible();
  const start = grid.locator('button[tabindex="0"]');
  await start.focus();
  await expect(start).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("button:focus")).toHaveAttribute("aria-label", /time step 1/);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("button:focus")).toHaveAttribute("aria-label", /q1/);
});

test("live state preview shows Bell amplitudes and the Bloch sphere for 1 qubit", async ({ page }) => {
  await page.goto("/composer");
  const preview = page.locator("section", { has: page.getByRole("heading", { name: "Live state preview" }) });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("|00⟩");
  await expect(preview).toContainText("|11⟩");
  await expect(preview).toContainText("entangled");
  // Load the 1-qubit superposition preset via the palette → Bloch sphere appears.
  await openCommandPalette(page);
  await page.getByRole("combobox", { name: "Search commands" }).fill("superposition");
  await page.keyboard.press("Enter");
  await expect(preview.getByRole("img", { name: /Bloch sphere/ })).toBeVisible();
});
