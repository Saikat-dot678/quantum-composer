import { expect, test } from "@playwright/test";
import {
  BELL_OPS,
  enableStateAnalysis,
  gotoSimulatorWithCircuit,
  requireBackend,
  runAndOpenQuantumState,
  selectEngineLane,
} from "./stateAnalysisHelpers";

// Screenshot baselines for the six named Quantum State views. Like
// visual.spec.ts, these are platform-specific (skipped in CI, local
// regression net only) -- and additionally backend-dependent, since the
// entire point of this feature is real backend-computed content. Refresh
// baselines with:
//   npx playwright test e2e/state-analysis-visual.spec.ts --update-snapshots
test.skip(!!process.env.CI, "Screenshot baselines are platform-specific; run locally.");

// The results dock is deliberately height-capped (max-h-[calc(40vh-5.5rem)],
// overflow-y-auto) so it never grows unboundedly on an ordinary viewport --
// but that means the *default* desktop viewport's 40vh isn't tall enough to
// show a Bloch sphere or a multi-row table without scrolling first. A taller
// viewport (not a wider one) gives the same dock more room the same way a
// real user maximizing their window would, without changing any component.
test.use({ viewport: { width: 1280, height: 1800 } });

test.beforeEach(async () => {
  test.skip(!(await requireBackend()), "Backend not reachable at http://localhost:8000 - start FastAPI to run this suite.");
});

const resultDock = (page: import("@playwright/test").Page) => page.locator('[aria-labelledby="result-dock-heading"]');

test("one-qubit Bloch result", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 1, num_clbits: 0, operations: [{ gate: "h", qubits: [0], moment: 0 }] });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);
  await page.getByRole("button", { name: "Bloch" }).click();
  await page.waitForTimeout(200);
  await expect(resultDock(page)).toHaveScreenshot("one-qubit-bloch.png", { maxDiffPixelRatio: 0.02, animations: "disabled" });
});

test("Bell-state reduced Bloch result", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 0, operations: BELL_OPS });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);
  await page.getByRole("button", { name: "Bloch" }).click();
  await page.waitForTimeout(200);
  await expect(resultDock(page)).toHaveScreenshot("bell-state-bloch.png", { maxDiffPixelRatio: 0.02, animations: "disabled" });
});

test("amplitude/phase view", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 0, operations: BELL_OPS });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);
  await page.getByRole("button", { name: "Phases" }).click();
  await page.waitForTimeout(200);
  await expect(resultDock(page)).toHaveScreenshot("amplitude-phase-view.png", { maxDiffPixelRatio: 0.02, animations: "disabled" });
});

test("density-matrix view", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 0, operations: BELL_OPS });
  await selectEngineLane(page, "DM");
  await enableStateAnalysis(page, { noise: true, densityMatrix: true });
  await runAndOpenQuantumState(page);
  await page.getByRole("button", { name: "Density Matrix", exact: true }).click();
  await page.waitForTimeout(200);
  await expect(resultDock(page)).toHaveScreenshot("density-matrix-view.png", { maxDiffPixelRatio: 0.02, animations: "disabled" });
});

test("entanglement view", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 0, operations: BELL_OPS });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);
  await page.getByRole("button", { name: "Entanglement" }).click();
  await page.waitForTimeout(200);
  await expect(resultDock(page)).toHaveScreenshot("entanglement-view.png", { maxDiffPixelRatio: 0.02, animations: "disabled" });
});

test("mobile state result", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 0, operations: BELL_OPS });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);
  await page.waitForTimeout(200);
  await expect(page).toHaveScreenshot("mobile-state-result.png", { fullPage: false, maxDiffPixelRatio: 0.02, animations: "disabled" });
});
