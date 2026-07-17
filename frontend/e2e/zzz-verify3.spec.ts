import { expect, test } from "@playwright/test";
import { BELL_OPS, enableStateAnalysis, gotoSimulatorWithCircuit, runAndOpenQuantumState, selectEngineLane } from "./stateAnalysisHelpers";

test.use({ viewport: { width: 1440, height: 1600 } });

test("stabilizer run shows generator strings in the Overview", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 0, operations: BELL_OPS });
  await selectEngineLane(page, "ST");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);
  await expect(page.getByText("Stabilizer generators", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Stabilizer generator list" }).locator("li")).toHaveCount(2);
  await page.screenshot({ path: "verify-stabilizer-generators.png", fullPage: false });
});

test("overview shows shots, engine time, exact badge, and amplitude counts", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 0, operations: BELL_OPS });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page, { detail: "full" });
  await runAndOpenQuantumState(page);
  await expect(page.getByText("Shots sampled")).toBeVisible();
  await expect(page.getByText("exact", { exact: true })).toBeVisible();
  await expect(page.getByText("pure state", { exact: true })).toBeVisible();
  await expect(page.getByText("Amplitudes", { exact: true })).toBeVisible();
  await expect(page.getByText(/rightmost character is qubit 0/)).toBeVisible();
});

test("probabilities view shows exact-vs-sampled comparison and amplitude controls work", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, {
    num_qubits: 3,
    num_clbits: 0,
    operations: [
      { gate: "h", qubits: [0], moment: 0 },
      { gate: "h", qubits: [1], moment: 0 },
      { gate: "h", qubits: [2], moment: 0 },
    ],
  });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page, { detail: "full" });
  await runAndOpenQuantumState(page);
  await page.getByRole("button", { name: "Probabilities" }).click();
  await expect(page.getByText("Exact probability vs. sampled frequency")).toBeVisible();
  await expect(page.getByText(/expected shot noise, not an error/)).toBeVisible();

  // Amplitude table controls: filter by basis.
  const filter = page.getByLabel("Filter basis states").first();
  await filter.fill("111");
  await expect(page.getByText(/1 of 8 states/)).toBeVisible();
  await filter.fill("");
  await page.screenshot({ path: "verify-probabilities-comparison.png", fullPage: false });
});

test("phases view detail toggle reveals Re/Im/radians columns", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, {
    num_qubits: 2,
    num_clbits: 0,
    operations: [
      { gate: "h", qubits: [0], moment: 0 },
      { gate: "s", qubits: [0], moment: 1 },
      { gate: "h", qubits: [1], moment: 0 },
      { gate: "t", qubits: [1], moment: 1 },
    ],
  });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page, { detail: "full" });
  await runAndOpenQuantumState(page);
  await page.getByRole("button", { name: "Phases" }).click();
  await page.getByText("Re / Im / radians columns").first().click();
  await expect(page.getByRole("columnheader", { name: "Re", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Phase (rad)" }).first()).toBeVisible();
  await expect(page.getByText(/rad$/).first()).toBeVisible();
  await page.screenshot({ path: "verify-phases-detail.png", fullPage: false });
});

test("density matrix heatmap modes, numeric table, and eigenvalues", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 0, operations: BELL_OPS });
  await selectEngineLane(page, "DM");
  await enableStateAnalysis(page, { noise: true, densityMatrix: true });
  await runAndOpenQuantumState(page);
  await page.getByRole("button", { name: "Density Matrix", exact: true }).click();
  await expect(page.getByText("Eigenvalue spectrum")).toBeVisible();
  await expect(page.getByText(/λ1 = /)).toBeVisible();
  await expect(page.getByText("Trace error")).toBeVisible();

  await page.getByRole("button", { name: "Real part" }).click();
  await expect(page.getByText(/Teal = positive, amber = negative/)).toBeVisible();
  await page.getByRole("button", { name: "Phase", exact: true }).click();
  await expect(page.getByText(/near-zero entries stay neutral/)).toBeVisible();

  await page.getByRole("button", { name: "Show numeric matrix table" }).click();
  await expect(page.locator("table caption", { hasText: "Exact complex density-matrix entries" })).toBeAttached();
  await page.screenshot({ path: "verify-density-modes.png", fullPage: false });
});

test("bloch view shows recognized state label for H|0>", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 1, num_clbits: 0, operations: [{ gate: "h", qubits: [0], moment: 0 }] });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);
  await page.getByRole("button", { name: "Bloch" }).click();
  await expect(page.getByText("≈ |+⟩")).toBeVisible();
});

test("bell state entanglement view shows per-qubit entropy", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 0, operations: BELL_OPS });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);
  await page.getByRole("button", { name: "Entanglement" }).click();
  await expect(page.getByText("Per-qubit reduced purity and entropy")).toBeVisible();
  await expect(page.getByText("1.000 bits").first()).toBeVisible();
});
