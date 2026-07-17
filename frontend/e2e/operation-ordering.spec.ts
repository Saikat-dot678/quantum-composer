import { expect, test } from "@playwright/test";
import { clickCircuitCell, openProjectsDrawer, workspaceStatus } from "./helpers";

const SCRAMBLED_CIRCUIT = {
  num_qubits: 4,
  num_clbits: 4,
  shots: 64,
  operations: [
    { gate: "measure", qubits: [1], clbits: [1], params: {}, moment: 5 },
    { gate: "cx", qubits: [0, 3], clbits: [], params: {}, moment: 3 },
    { gate: "h", qubits: [0], clbits: [], params: {}, moment: 0 },
    { gate: "measure", qubits: [0], clbits: [0], params: {}, moment: 4 },
    { gate: "cx", qubits: [0, 1], clbits: [], params: {}, moment: 1 },
    { gate: "measure", qubits: [3], clbits: [3], params: {}, moment: 7 },
    { gate: "cx", qubits: [0, 2], clbits: [], params: {}, moment: 2 },
    { gate: "measure", qubits: [2], clbits: [2], params: {}, moment: 6 },
  ],
};

const PYTHON_SEQUENCE = [
  "circuit.h(0)", "circuit.cx(0, 1)", "circuit.cx(0, 2)", "circuit.cx(0, 3)",
  "circuit.measure(0, 0)", "circuit.measure(1, 1)", "circuit.measure(2, 2)", "circuit.measure(3, 3)",
];

const QASM_SEQUENCE = [
  "h q[0];", "cx q[0],q[1];", "cx q[0],q[2];", "cx q[0],q[3];",
  "measure q[0] -> c[0];", "measure q[1] -> c[1];", "measure q[2] -> c[2];", "measure q[3] -> c[3];",
];

function encodeLegacy(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function requireBackend(): Promise<boolean> {
  try { return (await fetch("http://localhost:8000/health")).ok; } catch { return false; }
}

function expectSequence(content: string, sequence: string[]): void {
  const offsets = sequence.map((line) => content.indexOf(line));
  expect(offsets.every((offset) => offset >= 0)).toBe(true);
  expect(offsets).toEqual([...offsets].sort((left, right) => left - right));
}

test.beforeEach(async () => {
  test.skip(!(await requireBackend()), "Backend not reachable at http://localhost:8000 - start FastAPI to run ordering integration tests.");
});

test("scrambled array, run, code, QASM, diagram, and project reload share visual chronology", async ({ page }) => {
  await page.goto(`/composer?c=${encodeLegacy(SCRAMBLED_CIRCUIT)}`);
  await expect(workspaceStatus(page)).toContainText("4q");

  // Move q1's measurement left and back. Its JavaScript array position stays
  // stale while its moment changes, which is the regression condition.
  const canvas = page.getByRole("application");
  await clickCircuitCell(page, 1, 5);
  await canvas.focus();
  await page.keyboard.press("m");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await clickCircuitCell(page, 1, 4);
  await canvas.focus();
  await page.keyboard.press("m");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("img", { name: /graphical Qiskit circuit/ })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("tab", { name: "Qiskit" }).click();
  expectSequence(await page.getByRole("tabpanel").innerText(), PYTHON_SEQUENCE);
  await page.getByRole("tab", { name: "OpenQASM" }).click();
  expectSequence(await page.getByRole("tabpanel").innerText(), QASM_SEQUENCE);

  await openProjectsDrawer(page);
  const drawer = page.getByRole("dialog", { name: /Projects/i });
  await drawer.getByLabel("Name current circuit").fill("Ordering regression");
  await drawer.getByRole("button", { name: "Save as" }).click();
  await page.keyboard.press("Escape");
  await page.goto("/composer");
  await expect(workspaceStatus(page)).toContainText("4q");
  await page.getByRole("button", { name: "Generate" }).click();
  await expect(page.getByRole("tab", { name: "Qiskit" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Qiskit" }).click();
  expectSequence(await page.getByRole("tabpanel").innerText(), PYTHON_SEQUENCE);
});
