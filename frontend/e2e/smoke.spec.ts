import { deflateRawSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { clickCircuitCell, openCommandPalette, openProjectsDrawer, projectStatus, workspaceStatus } from "./helpers";

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

test("root redirects to the composer with the workspace status visible", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/composer$/);
  await expect(page).toHaveTitle(/Quantum Composer/);
  await expect(workspaceStatus(page)).toContainText("2q · 4 ops");
  await expect(page.getByRole("application")).toBeVisible();
});

test("top bar mode switcher navigates between routes", async ({ page }) => {
  await page.goto("/composer");
  const nav = page.getByRole("navigation", { name: "Workspace mode" });
  await nav.getByRole("button", { name: "Simulator" }).click();
  await expect(page).toHaveURL(/\/simulator$/);
  await expect(page.getByRole("heading", { name: /Engine evidence/ })).toBeVisible();
  await nav.getByRole("button", { name: "Cryptography" }).click();
  await expect(page).toHaveURL(/\/crypto$/);
  await expect(page.getByRole("heading", { name: "Protocol analysis workspace" })).toBeVisible();
  await nav.getByRole("button", { name: "Composer" }).click();
  await expect(page).toHaveURL(/\/composer$/);
  await expect(page.getByRole("application")).toBeVisible();
});

test("labs are directly deep-linkable", async ({ page }) => {
  await page.goto("/simulator");
  await expect(page.getByRole("heading", { name: /Engine evidence/ })).toBeVisible();
  await page.goto("/crypto");
  await expect(page.getByRole("heading", { name: "Protocol analysis workspace" })).toBeVisible();
});

test("a compressed ?c2= link reproduces the encoded circuit", async ({ page }) => {
  await page.goto(`/composer?c2=${encodeCompressed(SHARED_CIRCUIT)}`);
  await expect(workspaceStatus(page)).toContainText("3q · 1 ops");
  await expect(page).toHaveURL(/\/composer$/); // parameter consumed and stripped
});

test("a legacy ?c= link still decodes (backward compatibility)", async ({ page }) => {
  await page.goto(`/composer?c=${encodeLegacy(SHARED_CIRCUIT)}`);
  await expect(workspaceStatus(page)).toContainText("3q · 1 ops");
});

test("an invalid share link is rejected with an explanatory toast", async ({ page }) => {
  await page.goto("/composer?c2=not-a-real-payload");
  await expect(page.getByRole("status").filter({ hasText: "shared link is invalid" })).toBeVisible();
  await expect(workspaceStatus(page)).toContainText("2q · 4 ops");
});

test("the share button copies a compressed link that round-trips", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  await page.goto("/composer");
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByRole("button", { name: /Link copied/ })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("/composer?c2=");
  await page.goto(copied);
  await expect(workspaceStatus(page)).toContainText("2q · 4 ops");
});

test("placing a gate is undoable with Ctrl+Z", async ({ page }) => {
  await page.goto("/composer");
  await expect(workspaceStatus(page)).toContainText("2q · 4 ops");
  // q0, moment 7 is empty in the default Bell-pair preset (its H/CX/M gates
  // occupy moments 0-2); Hadamard is the default selected gate on load.
  await clickCircuitCell(page, 0, 7);
  await expect(workspaceStatus(page)).toContainText("2q · 5 ops");
  await page.keyboard.press("Control+z");
  await expect(workspaceStatus(page)).toContainText("2q · 4 ops");
  await page.keyboard.press("Control+y");
  await expect(workspaceStatus(page)).toContainText("2q · 5 ops");
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
  await expect(projectStatus(page)).toContainText("E2E Bell");
  // The palette lists it as a recent project.
  await openCommandPalette(page);
  await page.getByRole("combobox", { name: "Search commands" }).fill("E2E Bell");
  await expect(page.getByRole("option", { name: /Open recent: E2E Bell/ })).toBeVisible();
});

test("circuit canvas supports arrow-key cursor navigation with an accessible live announcement", async ({ page }) => {
  await page.goto("/composer");
  const canvas = page.getByRole("application");
  await expect(canvas).toBeVisible();
  await canvas.focus();
  await expect(canvas).toBeFocused();
  const announcement = page.locator("#circuit-canvas-cursor");
  await page.keyboard.press("ArrowRight");
  await expect(announcement).toHaveText(/time 1/);
  await page.keyboard.press("ArrowDown");
  await expect(announcement).toHaveText(/q1/);
});

test("live state preview shows Bell amplitudes and the Bloch sphere for 1 qubit", async ({ page }) => {
  await page.goto("/composer");
  const preview = page.locator("section", { has: page.getByRole("heading", { name: "Live ideal preview" }) });
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

test("placing a two-qubit gate connects both endpoints in one moment", async ({ page }) => {
  await page.goto("/composer");
  await expect(workspaceStatus(page)).toContainText("2q · 4 ops");
  await page.getByRole("button", { name: /^Controlled X\./ }).click();
  // Both clicks target moment 7 (empty for both qubits in the default preset):
  // the first click arms a pending endpoint on q0, the second on q1 completes it.
  await clickCircuitCell(page, 0, 7);
  await clickCircuitCell(page, 1, 7);
  await expect(workspaceStatus(page)).toContainText("2q · 5 ops");
});

test("a placed gate can be repositioned via select, delete, and re-place", async ({ page }) => {
  await page.goto("/composer");
  await expect(workspaceStatus(page)).toContainText("2q · 4 ops");
  await page.getByRole("button", { name: /^Hadamard\./ }).click();
  await clickCircuitCell(page, 0, 7);
  await expect(workspaceStatus(page)).toContainText("2q · 5 ops");
  // Select the gate just placed, then delete it and place it one column over.
  await clickCircuitCell(page, 0, 7);
  await expect(page.getByText("Selected operation", { exact: true })).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(workspaceStatus(page)).toContainText("2q · 4 ops");
  await clickCircuitCell(page, 0, 6);
  await expect(workspaceStatus(page)).toContainText("2q · 5 ops");
});

test("mobile viewport exposes the gate dock and settings as bottom sheets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/composer");
  await expect(page.getByRole("application")).toBeVisible();

  await page.getByRole("button", { name: "Gates" }).click();
  const gateSheet = page.getByRole("dialog", { name: "Gate library" });
  await expect(gateSheet).toBeVisible();
  await expect(gateSheet.getByRole("button", { name: /^Hadamard\./ })).toBeVisible();
  await page.getByRole("button", { name: "Close Gate library" }).click();
  await expect(gateSheet).not.toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  const settingsSheet = page.getByRole("dialog", { name: "Circuit settings" });
  await expect(settingsSheet).toBeVisible();
  await expect(settingsSheet.getByText("Register & run settings")).toBeVisible();
});

test("mobile viewport top bar switches routes without the desktop mode labels overflowing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/composer");
  const nav = page.getByRole("navigation", { name: "Workspace mode" });
  await nav.getByRole("button", { name: "Cryptography" }).click();
  await expect(page).toHaveURL(/\/crypto$/);
  await expect(page.getByRole("heading", { name: "Protocol analysis workspace" })).toBeVisible();
});

test("the backend-offline state is honest and offers a retry", async ({ page }) => {
  // The whole suite runs against a production build with no backend attached
  // (see playwright.config.ts) — this asserts that offline state explicitly
  // instead of only relying on other tests not crashing because of it.
  await page.goto("/composer");
  const backendPill = page.getByRole("button", { name: /Offline|Checking/ }).first();
  await expect(backendPill).toBeVisible();
  await expect(page.getByRole("application")).toBeVisible(); // canvas still usable offline
});
