import { expect, test } from "@playwright/test";

test.skip(!!process.env.CI, "Circuit diagram screenshot baselines are platform-specific; run locally.");

function encodeLegacy(circuit: unknown): string {
  return Buffer.from(JSON.stringify(circuit), "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function foldedCircuit() {
  const operations: Array<Record<string, unknown>> = [];
  for (let moment = 0; moment < 52; moment += 1) {
    operations.push({ gate: moment % 2 ? "rz" : "h", qubits: [0], clbits: [], params: moment % 2 ? { theta: moment / 12 } : {}, moment });
  }
  return { num_qubits: 6, num_clbits: 0, shots: 64, operations };
}

async function run(page: import("@playwright/test").Page, circuit?: unknown) {
  await page.goto(circuit ? `/composer?c=${encodeLegacy(circuit)}` : "/composer");
  await page.getByRole("button", { name: "Run" }).click();
  const viewer = page.getByRole("region", { name: "Simulated circuit" }).or(page.locator('section[aria-label="Simulated circuit"]')).first();
  await expect(page.getByRole("img", { name: /graphical Qiskit circuit/ }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Simulation complete.*shots/)).toBeHidden({ timeout: 10_000 });
  await viewer.scrollIntoViewIfNeeded();
  return viewer;
}

test("Bell circuit diagram", async ({ page }) => {
  const viewer = await run(page);
  await expect(viewer).toHaveScreenshot("circuit-diagram-bell.png", { animations: "disabled" });
});

test("medium folded circuit diagram", async ({ page }) => {
  const viewer = await run(page, foldedCircuit());
  await expect(viewer).toHaveScreenshot("circuit-diagram-folded.png", { animations: "disabled" });
});

test("mobile circuit diagram", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const viewer = await run(page, foldedCircuit());
  await expect(viewer).toHaveScreenshot("circuit-diagram-mobile.png", { animations: "disabled" });
});

test("fullscreen circuit diagram", async ({ page }) => {
  await run(page, foldedCircuit());
  await page.getByRole("button", { name: "Open fullscreen circuit diagram" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Fullscreen Simulated circuit" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveScreenshot("circuit-diagram-fullscreen.png", { animations: "disabled" });
});

test("medium-width unfolded circuit diagram", async ({ page }) => {
  const circuit = { num_qubits: 4, num_clbits: 0, shots: 64, operations: Array.from({ length: 18 }, (_, moment) => ({ gate: "h", qubits: [moment % 4], clbits: [], params: {}, moment })) };
  const viewer = await run(page, circuit);
  await expect(viewer).toHaveScreenshot("circuit-diagram-medium.png", { animations: "disabled" });
});
