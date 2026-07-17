import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  BELL_MEASURED_OPS,
  BELL_OPS,
  enableStateAnalysis,
  gotoSimulatorWithCircuit,
  MID_CIRCUIT_MEASUREMENT_OPS,
  requireBackend,
  runAndOpenQuantumState,
  selectEngineLane,
} from "./stateAnalysisHelpers";
import { clickCircuitCell } from "./helpers";

test.beforeEach(async () => {
  test.skip(!(await requireBackend()), "Backend not reachable at http://localhost:8000 - start FastAPI to run this suite.");
});

// Targets the <dd> immediately following the <dt> with exact text "x"/"y"/"z"
// in BlochQubitView's stats grid -- robust to reordering, and distinct from
// the separate "<X>"/"<Y>"/"<Z>" expectation-value row just below it.
function blochStat(page: import("@playwright/test").Page, axis: "x" | "y" | "z") {
  return page.locator(`dt:text-is("${axis}") + dd`);
}

test("H|0> shows a Bloch vector on the +X axis", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 1, num_clbits: 0, operations: [{ gate: "h", qubits: [0], moment: 0 }] });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);
  await page.getByRole("button", { name: "Bloch" }).click();
  await expect(blochStat(page, "x")).toHaveText("1.0000");
  await expect(blochStat(page, "y")).toHaveText("0.0000");
  await expect(blochStat(page, "z")).toHaveText("0.0000");
});

test("X|0> shows a Bloch vector at the south pole", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 1, num_clbits: 0, operations: [{ gate: "x", qubits: [0], moment: 0 }] });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);
  await page.getByRole("button", { name: "Bloch" }).click();
  await expect(blochStat(page, "x")).toHaveText("0.0000");
  await expect(blochStat(page, "y")).toHaveText("0.0000");
  await expect(blochStat(page, "z")).toHaveText("-1.0000");
});

test("S.H|0> shows a Bloch vector on the +Y axis", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, {
    num_qubits: 1,
    num_clbits: 0,
    operations: [
      { gate: "h", qubits: [0], moment: 0 },
      { gate: "s", qubits: [0], moment: 1 },
    ],
  });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);
  await page.getByRole("button", { name: "Bloch" }).click();
  await expect(blochStat(page, "x")).toHaveText("0.0000");
  await expect(blochStat(page, "y")).toHaveText("1.0000");
  await expect(blochStat(page, "z")).toHaveText("0.0000");
});

test("Bell state: q0's reduced Bloch vector is maximally mixed while the global state is entangled", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 0, operations: BELL_OPS });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);

  await page.getByRole("button", { name: "Bloch" }).click();
  await expect(page.getByText("mixed reduced state")).toBeVisible();
  await expect(page.getByText("magnitude 0.000")).toBeVisible();
  await expect(blochStat(page, "x")).toHaveText("0.0000");
  await expect(blochStat(page, "y")).toHaveText("0.0000");
  await expect(blochStat(page, "z")).toHaveText("0.0000");
  await expect(page.getByText(/entangled with the rest of the system/)).toBeVisible();

  await page.getByRole("button", { name: "Entanglement" }).click();
  await expect(page.getByText("concurrence 1.0000")).toBeVisible();
  await expect(page.getByText("entangled", { exact: true })).toBeVisible();
});

test("Probabilities view distinguishes exact theoretical values from sampled counts", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 0, operations: BELL_OPS });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);

  await page.getByRole("button", { name: "Probabilities" }).click();
  await expect(page.getByText(/exact theoretical probabilities/)).toBeVisible();
  await expect(page.getByText(/not sampled shot counts/)).toBeVisible();

  // The Distribution tab (sampled counts) coexists and is clearly separate.
  await page.getByRole("button", { name: "Distribution" }).click();
  await expect(page.getByText("Measurement distribution")).toBeVisible();
});

test("A terminally-measured circuit shows the pre-measurement notice", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 2, operations: BELL_MEASURED_OPS });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);
  await expect(page.getByText("Pre-measurement analysis copy")).toBeVisible();
  await expect(page.getByText(/separate analysis copy of the circuit/)).toBeVisible();
  await expect(page.getByText("Pre-measurement state")).toBeVisible();
});

test("A mid-circuit measurement is reported as unavailable with a clear reason", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 1, num_clbits: 1, operations: MID_CIRCUIT_MEASUREMENT_OPS });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);
  await expect(page.getByText("Quantum state not available for this run")).toBeVisible();
});

test("A noisy density-matrix run shows a shortened (mixed) Bloch vector", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 1, num_clbits: 0, operations: [{ gate: "h", qubits: [0], moment: 0 }] });
  await selectEngineLane(page, "DM");
  await enableStateAnalysis(page, { noise: true });
  await runAndOpenQuantumState(page);
  await page.getByRole("button", { name: "Bloch" }).click();
  const magnitudeBadge = page.getByText(/^magnitude 0\./);
  await expect(magnitudeBadge).toBeVisible();
  const magnitudeText = await magnitudeBadge.textContent();
  const magnitude = Number(magnitudeText?.replace("magnitude ", ""));
  expect(magnitude).toBeGreaterThan(0);
  expect(magnitude).toBeLessThan(1);
});

test("Composer custom matrix gate stays resolved through the Simulator Lab handoff", async ({ page }) => {
  await page.goto("/composer");
  await page.getByRole("button", { name: "Create a new custom gate or operation" }).click();
  const dialog = page.getByRole("dialog", { name: "New gate or operation" });
  await dialog.getByRole("button", { name: "Hadamard (matrix example)" }).click();
  await dialog.getByRole("button", { name: "Create gate" }).click();
  await page.getByRole("button", { name: /^Hadamard \(matrix example\)\./ }).click();
  await clickCircuitCell(page, 0, 7);
  const analysisRequest = page.waitForRequest((request) => request.url().endsWith("/circuit/analyze") && request.method() === "POST");
  await page.locator("#main-content").getByRole("button", { name: "Simulator Lab", exact: true }).click();
  await expect(page).toHaveURL(/\/simulator/);
  const analyzedCircuit = (await analysisRequest).postDataJSON() as { operations: Array<{ gate: string; matrix?: unknown; label?: string }> };
  expect(analyzedCircuit.operations.some((operation) => operation.gate === "custom")).toBe(false);
  expect(analyzedCircuit.operations.some((operation) => operation.gate === "unitary" && operation.matrix && operation.label)).toBe(true);
  await expect(page.getByText("Live Composer circuit").first()).toBeVisible();
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  const runRequest = page.waitForRequest((request) => request.url().endsWith("/circuit/simulate-v2") && request.method() === "POST");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const runCircuit = ((await runRequest).postDataJSON() as { circuit: { operations: Array<{ gate: string; matrix?: unknown; label?: string }> } }).circuit;
  expect(runCircuit.operations.some((operation) => operation.gate === "custom")).toBe(false);
  expect(runCircuit.operations.some((operation) => operation.gate === "unitary" && operation.matrix && operation.label)).toBe(true);
  await expect(page.getByText(/completed$/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Quantum State" }).click();
  await expect(page.getByText("Simulated quantum state")).toBeVisible();
});

test("JSON export downloads a file with the expected schema", async ({ page }) => {
  await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 0, operations: BELL_OPS });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export JSON" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("quantum-state.json");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  expect(payload.schemaVersion).toBe(1);
  expect(payload.state.representation).toBe("statevector");
  expect(payload.state.qubit_order).toBe("qiskit_little_endian_q0_lsb");
  expect(Array.isArray(payload.state.top_states)).toBe(true);
});

test("the Quantum State tab is usable at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 0, operations: BELL_OPS });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page);
  await runAndOpenQuantumState(page);
  await expect(page.getByText("The actual state returned by")).toBeVisible();
  await page.getByRole("button", { name: "Entanglement" }).click();
  await expect(page.getByText("concurrence 1.0000")).toBeVisible();
});

const A11Y_SCENARIOS: Array<{ name: string; engine: string; noise?: boolean; densityMatrix?: boolean; views: string[] }> = [
  { name: "statevector Bell state", engine: "SV", views: ["Overview", "Probabilities", "Phases", "Bloch", "Entanglement"] },
  { name: "noisy density matrix", engine: "DM", noise: true, densityMatrix: true, views: ["Density Matrix"] },
];

for (const scenario of A11Y_SCENARIOS) {
  test(`axe: Quantum State views have no serious or critical violations (${scenario.name})`, async ({ page }) => {
    await gotoSimulatorWithCircuit(page, { num_qubits: 2, num_clbits: 0, operations: BELL_OPS });
    await selectEngineLane(page, scenario.engine);
    await enableStateAnalysis(page, { noise: scenario.noise, densityMatrix: scenario.densityMatrix });
    await runAndOpenQuantumState(page);

    for (const view of scenario.views) {
      await page.getByRole("button", { name: view, exact: true }).click();
      await page.waitForTimeout(150);
      const results = await new AxeBuilder({ page })
        .include('[aria-labelledby="result-dock-heading"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
      expect(blocking.map((violation) => `${view}: ${violation.id}: ${violation.help} (${violation.nodes.length} nodes)`)).toEqual([]);
    }
  });
}
