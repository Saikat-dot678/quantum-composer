import { expect, test } from "@playwright/test";

function encodeLegacy(circuit: unknown): string {
  return Buffer.from(JSON.stringify(circuit), "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function mediumCircuit() {
  const operations: Array<Record<string, unknown>> = [];
  for (let moment = 0; moment < 56; moment += 1) {
    operations.push({ gate: moment % 3 === 0 ? "h" : "rz", qubits: [0], clbits: [], params: moment % 3 === 0 ? {} : { theta: moment / 10 }, moment });
  }
  for (let qubit = 0; qubit < 8; qubit += 1) operations.push({ gate: "measure", qubits: [qubit], clbits: [qubit], params: {}, moment: 60 });
  return { num_qubits: 8, num_clbits: 8, shots: 64, operations };
}

async function requireBackend(): Promise<boolean> {
  try {
    return (await fetch("http://localhost:8000/health")).ok;
  } catch {
    return false;
  }
}

async function runComposer(page: import("@playwright/test").Page, circuit?: unknown) {
  await page.goto(circuit ? `/composer?c=${encodeLegacy(circuit)}` : "/composer");
  await page.getByRole("button", { name: "Run" }).click();
  const diagram = page.getByRole("img", { name: /graphical Qiskit circuit/ });
  await expect(diagram).toBeVisible({ timeout: 30_000 });
  return diagram;
}

test.beforeEach(async () => {
  test.skip(!(await requireBackend()), "Backend not reachable at http://localhost:8000 - start FastAPI to run graphical diagram tests.");
});

test("renders the Bell SVG and supports zoom, fit, fullscreen, and downloads", async ({ page }) => {
  await runComposer(page);
  await expect(page.getByLabel("Text diagram")).toHaveCount(0);

  const reset = page.getByRole("button", { name: "Reset circuit diagram zoom" }).first();
  await reset.click();
  await expect(reset).toHaveText("100%");
  await page.getByRole("button", { name: "Zoom in circuit diagram" }).first().click();
  await expect(reset).toHaveText("125%");
  await page.getByRole("button", { name: "Fit circuit diagram to viewport" }).first().click();

  await page.getByRole("button", { name: "Open fullscreen circuit diagram" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Fullscreen Simulated circuit" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img", { name: /graphical Qiskit circuit/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Close fullscreen circuit diagram" }).click();

  const svgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download circuit diagram as SVG" }).first().click();
  await expect((await svgDownload).suggestedFilename()).toBe("quantum-circuit.svg");

  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download circuit diagram as PNG" }).first().click();
  await expect((await pngDownload).suggestedFilename()).toBe("quantum-circuit.png");
});

test("shows the diagram loading state while the backend renderer is pending", async ({ page }) => {
  await page.route("**/circuit/simulate", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await page.goto("/composer");
  await page.getByRole("button", { name: "Run" }).click();
  await page.getByRole("button", { name: /Code & results.*running/ }).click();
  await expect(page.getByText(/Rendering circuit diagram/)).toBeVisible();
  await expect(page.getByRole("img", { name: /graphical Qiskit circuit/ })).toBeVisible({ timeout: 30_000 });
});

test("a folded medium circuit scrolls internally without document overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await runComposer(page, mediumCircuit());
  await expect(page.getByText(/wrapped into multiple rows/).first()).toBeVisible();
  const viewport = page.getByLabel("Simulated circuit scrollable viewport").first();
  const sizes = await viewport.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(sizes.scroll).toBeGreaterThan(sizes.client);
  const pageSizes = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
  expect(pageSizes.documentWidth).toBeLessThanOrEqual(pageSizes.viewportWidth + 1);
});

test("Simulator Lab renders the same shared graphical viewer", async ({ page }) => {
  await page.goto("/simulator");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText(/completed$/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Diagram", exact: true }).click();
  await expect(page.getByRole("img", { name: /Simulated circuit, graphical Qiskit circuit/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fit circuit diagram to viewport" })).toBeVisible();
});

test("render failure shows an honest unavailable state and never reveals legacy ASCII", async ({ page }) => {
  await page.route("**/circuit/simulate", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ counts: { "00": 32, "11": 32 }, depth: 2, gate_counts: { h: 1, cx: 1 }, diagram: "ASCII FALLBACK MUST STAY HIDDEN", circuit_diagram: null, warnings: ["The circuit simulation completed, but the graphical diagram could not be rendered."] }),
  }));
  await page.goto("/composer");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText("Circuit diagram unavailable")).toBeVisible();
  await expect(page.getByText("ASCII FALLBACK MUST STAY HIDDEN")).toHaveCount(0);
});

test("mobile diagram controls remain reachable without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await runComposer(page);
  await expect(page.getByRole("button", { name: "Open fullscreen circuit diagram" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Download circuit diagram as SVG" }).first()).toBeVisible();
  const pageSizes = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
  expect(pageSizes.documentWidth).toBeLessThanOrEqual(pageSizes.viewportWidth + 1);
});
