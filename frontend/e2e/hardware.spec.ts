import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { clickCircuitCell, workspaceStatus } from "./helpers";

async function requireBackend(): Promise<boolean> {
  try {
    return (await fetch("http://localhost:8000/health")).ok;
  } catch {
    return false;
  }
}

test.beforeEach(async () => {
  test.skip(!(await requireBackend()), "Backend not reachable at http://localhost:8000 - start FastAPI to run Hardware Mapping tests.");
});

test("opens the current Composer circuit, renders topology, and maps a restrictive layout", async ({ page }) => {
  await page.goto("/hardware");
  await expect(page.getByRole("heading", { name: "Trace a logical circuit onto a physical target" })).toBeVisible();
  await expect(page.getByText(/Loaded the active Composer circuit/)).toBeVisible();
  await expect(page.getByRole("img", { name: /5-qubit coupling topology/ })).toBeVisible({ timeout: 15_000 });

  await page.getByLabel("Initial layout").fill("0,4");
  await page.getByRole("button", { name: "Transpile and map", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Logical-to-physical layout" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/inserted SWAP/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Routing timeline" })).toBeVisible();
  await page.getByText("Circuit diagrams", { exact: true }).click();
  await expect(page.getByRole("img", { name: /Logical circuit, graphical Qiskit circuit/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Transpiled physical circuit, graphical Qiskit circuit/ })).toBeVisible();
  await page.getByRole("button", { name: /^q0$/ }).first().click();
  await expect(page.getByText(/Physical q.*carries logical q0/)).toBeVisible();
  await page.getByText("Used physical edges").locator("..").getByRole("button").first().click();
  await expect(page.getByText(/Edge q\d+ → q\d+ is used by a transpiled two-qubit operation/)).toBeVisible();
});

test("resolves a Composer custom matrix gate before hardware transpilation", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/composer");
  const createGate = page.getByRole("button", { name: "Create a new custom gate or operation" });
  await expect(async () => {
    if (!await createGate.isVisible()) await page.reload();
    await expect(createGate).toBeVisible({ timeout: 8_000 });
  }).toPass({ timeout: 30_000 });
  await createGate.click();
  const dialog = page.getByRole("dialog", { name: "New gate or operation" });
  await dialog.getByRole("button", { name: "Hadamard (matrix example)" }).click();
  await dialog.getByRole("button", { name: "Create gate" }).click();
  await page.getByRole("button", { name: /^Hadamard \(matrix example\)\./ }).click();
  await clickCircuitCell(page, 0, 7);
  await expect(workspaceStatus(page)).toContainText("5 ops");
  await page.locator("#main-content").getByRole("button", { name: "Hardware", exact: true }).click();
  await expect(page).toHaveURL(/\/hardware/);
  await expect(page.getByText(/Custom definitions were resolved and flattened/)).toBeVisible();
  await page.getByRole("button", { name: "Transpile and map", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Logical-to-physical layout" })).toBeVisible({ timeout: 30_000 });
});

test("loads an installed fake target and exercises two optimization levels", async ({ page }) => {
  await page.goto("/hardware");
  await page.getByRole("button", { name: "Discover installed fake snapshots" }).click();
  const catalog = page.getByRole("list", { name: "Discovered hardware backends" });
  await expect(catalog).toBeVisible({ timeout: 30_000 });
  const targetButtons = catalog.getByRole("button");
  let targetButton = targetButtons.first();
  let targetName = (await targetButton.locator("span").first().textContent())?.trim();
  for (let index = 0; index < await targetButtons.count(); index += 1) {
    const candidate = targetButtons.nth(index);
    const candidateName = (await candidate.locator("span").first().textContent())?.trim();
    if (candidateName && /fake_(jakarta|lagos|nairobi|oslo|manila|lima|quito|belem)/.test(candidateName)) {
      targetButton = candidate;
      targetName = candidateName;
      break;
    }
  }
  expect(targetName).toBeTruthy();
  await targetButton.click();
  await expect(page.getByRole("heading", { name: new RegExp(`${targetName} topology`, "i") })).toBeVisible({ timeout: 30_000 });

  const level = page.getByLabel("Optimization level");
  await level.selectOption("0");
  await page.getByRole("button", { name: "Transpile and map", exact: true }).first().click();
  await expect(page.getByText(/Optimization 0 · seed/)).toBeVisible({ timeout: 30_000 });
  await level.selectOption("3");
  await page.getByRole("button", { name: "Transpile and map", exact: true }).first().click();
  await expect(page.getByText(/Optimization 3 · seed/)).toBeVisible({ timeout: 30_000 });
});

test("imports manual hardware and OpenQASM while rejecting Python", async ({ page }) => {
  await page.goto("/hardware");
  await page.getByText("Manual hardware JSON", { exact: true }).click();
  const definition = {
    format: "quantum-composer-hardware",
    version: 1,
    name: "Directed triangle teaching target",
    num_qubits: 3,
    edges: [
      { control: 0, target: 1, two_qubit_error: 0.02 },
      { control: 1, target: 2, two_qubit_error: 0.03 },
    ],
    undirected: false,
    basis_gates: ["rz", "sx", "x", "cx"],
    coordinates: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }],
  };
  await page.getByLabel("Manual hardware definition").fill(JSON.stringify(definition));
  await page.getByText("Manual hardware JSON", { exact: true }).locator("xpath=ancestor::details").getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Directed triangle teaching target topology" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Coordinates supplied by the target definition")).toBeVisible();

  await page.getByRole("button", { name: "OpenQASM 2" }).click();
  await page.getByLabel("qasm2 circuit source").fill('OPENQASM 2.0; include "qelib1.inc"; qreg q[2]; h q[0]; cx q[0],q[1];');
  await page.getByRole("button", { name: "Validate and load" }).click();
  await expect(page.getByText(/Validated 2 qubits, 2 operations/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Python" }).click();
  await page.getByLabel("python circuit source").fill("from qiskit import QuantumCircuit\nqc = QuantumCircuit(2)");
  await page.getByRole("button", { name: "Reject Python safely" }).click();
  await expect(page.getByText(/Python source is never executed or imported/)).toBeVisible();
});

test("mock account discovery handles missing credentials, long names, and optional metadata", async ({ page }) => {
  await page.route("**/hardware/status", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      ibm_runtime_installed: true,
      ibm_runtime_version: "0.test",
      fake_provider_available: true,
      qasm3_import_available: false,
      connection_mode: "none",
      connected: false,
      instance_hint: null,
      account_error: null,
      execution_enabled: false,
      credential_storage_note: "Credentials stay server-side.",
    }),
  }));
  await page.route("**/hardware/backends?source=ibm**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      source: "ibm",
      warnings: [],
      backends: [{
        source: "ibm",
        name: "ibm_fez",
        num_qubits: 127,
        basis_gates: ["cz", "rz", "sx", "x"],
        simulator: false,
        operational: true,
        pending_jobs: null,
        processor_family: null,
        processor_version: null,
        region: null,
        dynamic_circuits: null,
        calibration_timestamp: null,
        description: null,
      }, {
        source: "ibm",
        name: "ibm_backend_with_an_intentionally_extremely_long_account_scoped_name",
        num_qubits: 127,
        basis_gates: ["cz", "rz", "sx", "x"],
        simulator: false,
        operational: true,
        pending_jobs: null,
        processor_family: null,
        processor_version: null,
        region: null,
        dynamic_circuits: null,
        calibration_timestamp: null,
        description: null,
      }],
    }),
  }));
  await page.route("**/hardware/target/describe", async (route) => {
    const request = route.request().postDataJSON() as { target?: { kind?: string; name?: string } };
    if (request.target?.kind !== "ibm") return route.continue();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        summary: {
          source: "ibm", name: request.target.name, num_qubits: 3,
          basis_gates: ["cz", "rz", "sx", "x"], simulator: false,
          operational: true, pending_jobs: 7, processor_family: "Heron",
          processor_version: null, region: null, dynamic_circuits: true,
          calibration_timestamp: null, description: null,
        },
        coupling_edges: [[0, 1], [1, 0], [1, 2], [2, 1]],
        coordinates: null, coordinates_schematic: true,
        qubit_calibrations: [0, 1, 2].map((qubit) => ({ qubit, t1_us: null, t2_us: null, readout_error: null, frequency_ghz: null })),
        edge_calibrations: [], supported_instructions: ["cz", "rz", "sx", "x"],
        dt_ns: null, notes: null, warnings: ["Mock account-scoped target."],
      }),
    });
  });
  await page.goto("/hardware");
  await expect(page.getByText("not connected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "IBM account" }).click();
  await expect(page.getByText("ibm_fez", { exact: true })).toBeVisible();
  await expect(page.getByText("ibm_backend_with_an_intentionally_extremely_long_account_scoped_name", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /ibm_fez/ }).click();
  await expect(page.getByRole("heading", { name: "ibm_fez topology" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

for (const viewport of [
  { width: 1280, height: 720, name: "short laptop" },
  { width: 820, height: 1180, name: "tablet" },
  { width: 390, height: 844, name: "phone" },
]) {
  test(`Hardware Mapping has no document overflow at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/hardware");
    await expect(page.getByRole("heading", { name: "Trace a logical circuit onto a physical target" })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
    await page.getByRole("link", { name: "2 · Target" }).focus();
    await expect(page.getByRole("link", { name: "2 · Target" })).toBeFocused();
  });
}

test("Hardware Mapping has no serious or critical axe violations", async ({ page }) => {
  await page.goto("/hardware");
  await expect(page.getByRole("img", { name: /coupling topology/ })).toBeVisible({ timeout: 15_000 });
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
});
