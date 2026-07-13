import { deflateRawSync } from "node:zlib";
import { expect, type Page } from "@playwright/test";

// Shared setup for the post-simulation Quantum State result tab (see
// components/simulator/state/*.tsx). These tests are backend-DEPENDENT --
// unlike smoke/a11y/visual (which deliberately run offline, per
// playwright.config.ts) -- because the entire point of this feature is that
// it is the *actual* backend-returned state, not the Composer's local
// preview. Run the backend locally first:
//   cd backend && python -m uvicorn main:app --port 8000
// Every test in files that use this helper skips itself (not the whole
// file) when the backend is unreachable, matching backend.spec.ts.

export interface MinimalOperation {
  gate: string;
  qubits: number[];
  moment: number;
  clbits?: number[];
  params?: Record<string, number>;
}

export interface MinimalCircuit {
  num_qubits: number;
  num_clbits: number;
  shots?: number;
  operations: MinimalOperation[];
}

function encodeCompressed(circuit: unknown): string {
  return deflateRawSync(Buffer.from(JSON.stringify(circuit), "utf-8")).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function requireBackend(): Promise<boolean> {
  try {
    const response = await fetch("http://localhost:8000/health");
    return response.ok;
  } catch {
    return false;
  }
}

// lib/circuitShare.ts's validateCircuitData strictly requires `clbits`
// (array) and `params` (object) on every operation, even when empty --
// otherwise the whole share link is rejected as invalid and silently falls
// back to whatever circuit was already loaded. MinimalOperation leaves them
// optional for test readability; fill in the defaults here instead of
// requiring every call site to spell them out.
function toFullCircuit(circuit: MinimalCircuit): unknown {
  return {
    num_qubits: circuit.num_qubits,
    num_clbits: circuit.num_clbits,
    shots: circuit.shots ?? 512,
    operations: circuit.operations.map((op) => ({
      gate: op.gate,
      qubits: op.qubits,
      clbits: op.clbits ?? [],
      params: op.params ?? {},
      moment: op.moment,
    })),
  };
}

/** Deep-links `circuit` into the Composer, then loads it as the live circuit in Simulator Lab. */
export async function gotoSimulatorWithCircuit(page: Page, circuit: MinimalCircuit): Promise<void> {
  const full = toFullCircuit(circuit);
  await page.goto(`/composer?c2=${encodeCompressed(full)}`);
  // app/composer/page.tsx decodes the share link, calls workspace.loadCircuit()
  // (persisting it into the shared WorkspaceProvider context), then strips
  // the query param via router.replace -- waiting for that URL change is a
  // reliable signal the circuit has been loaded into the live context.
  await page.waitForURL(/\/composer$/);
  // A *client-side* route transition (clicking the nav button), not a hard
  // page.goto -- the workspace circuit lives in an in-memory React context,
  // not just localStorage, and a hard navigation tears down that context
  // before any pending persistence effect is guaranteed to have flushed.
  await page.getByRole("navigation", { name: "Workspace mode" }).getByRole("button", { name: "Simulator" }).click();
  await page.waitForURL(/\/simulator/);
  await page.waitForTimeout(800); // circuit analysis round-trip on load
}

/** Selects an engine lane by its short prefix (e.g. "SV", "DM", "ST", "MPS"). */
export async function selectEngineLane(page: Page, prefix: string): Promise<void> {
  await page.getByRole("tab", { name: new RegExp(`^${prefix}`) }).click();
}

/** Switches the control panel to "Run options" and turns on state analysis, optionally with detail/density-matrix options. */
export async function enableStateAnalysis(page: Page, options: { detail?: "summary" | "top_amplitudes" | "full"; densityMatrix?: boolean; noise?: boolean } = {}): Promise<void> {
  // Below the xl breakpoint, the control panel itself is on a separate
  // mobile pane ("Circuits" / "Engine bench" / "Results") and is not in the
  // layout at all until selected -- switch to it first. This nav is
  // `xl:hidden`, so it's simply not visible at desktop widths.
  const mobileCircuitsTab = page.getByRole("navigation", { name: "Simulator workspace pane" }).getByRole("button", { name: "Circuits" });
  if (await mobileCircuitsTab.isVisible()) await mobileCircuitsTab.click();

  await page.getByRole("button", { name: "Run options" }).click();
  if (options.noise) await page.getByText("Depolarizing noise").click();
  const toggle = page.getByText("Post-simulation quantum state analysis");
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  if (options.detail) await page.getByLabel("Amplitude detail").selectOption(options.detail);
  if (options.densityMatrix) {
    const densityToggle = page.getByText("Include full density matrix payload");
    await densityToggle.scrollIntoViewIfNeeded();
    await densityToggle.click();
  }
}

/** Runs the current circuit/options and opens the Quantum State result tab. */
export async function runAndOpenQuantumState(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText(/completed$/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Quantum State" }).click();
  await page.waitForTimeout(200);
}

export const BELL_OPS: MinimalOperation[] = [
  { gate: "h", qubits: [0], moment: 0 },
  { gate: "cx", qubits: [0, 1], moment: 1 },
];

export const BELL_MEASURED_OPS: MinimalOperation[] = [
  ...BELL_OPS,
  { gate: "measure", qubits: [0], clbits: [0], moment: 2 },
  { gate: "measure", qubits: [1], clbits: [1], moment: 2 },
];

export const MID_CIRCUIT_MEASUREMENT_OPS: MinimalOperation[] = [
  { gate: "h", qubits: [0], moment: 0 },
  { gate: "measure", qubits: [0], clbits: [0], moment: 1 },
  { gate: "x", qubits: [0], moment: 2 },
  { gate: "measure", qubits: [0], clbits: [0], moment: 3 },
];
