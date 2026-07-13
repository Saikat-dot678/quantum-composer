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

// NOTE: a Playwright scenario driving a real custom gate through the
// Composer's "Simulator Lab" toolbar button and into this Quantum State tab
// is intentionally not included here. Investigating one revealed a
// pre-existing race in the Composer -> Simulator Lab handoff for circuits
// containing "custom" operations: ComposerMode.openSimulatorLab() correctly
// resolves the circuit (verified directly -- resolved.circuit's gates are
// ["unitary"] at the moment of the click), but by the time Simulator Lab
// actually issues its /circuit/simulate-v2 request, the circuit it holds has
// reverted to the raw, unresolved "custom" operation, which the backend
// rejects (a 422 on the disallowed "custom" gate literal) -- an honest
// failure, not a silently wrong result, but not the success path either.
// Two targeted fixes to app/simulator/page.tsx's one-shot `labCircuit`
// handoff ref were tried and both failed to resolve it empirically, pointing
// to something deeper in the client-side route transition than a component-
// level timing fix can reach. This is pre-existing Composer/Simulator-Lab
// handoff behavior, not something introduced by state analysis, and is
// flagged for dedicated follow-up rather than fixed here. The backend's own
// handling of a resolved "unitary" gate (what a correctly-flattened custom
// gate becomes) is fully covered by
// backend/tests/test_state_analysis_integration.py's unitary-gate
// compatibility test, and every view in this file is otherwise gate-
// provenance-agnostic -- it only ever renders the backend's state_analysis
// JSON, never anything gate-shape-specific.

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
