import { expect, test } from "@playwright/test";
import { enableStateAnalysis, gotoSimulatorWithCircuit, runAndOpenQuantumState, selectEngineLane, type MinimalOperation } from "./stateAnalysisHelpers";

test.use({ viewport: { width: 1440, height: 1600 } });

test("amplitude table virtualizes a 32-row list", async ({ page }) => {
  const operations: MinimalOperation[] = Array.from({ length: 5 }, (_, q) => ({ gate: "h", qubits: [q], moment: 0 }));
  await gotoSimulatorWithCircuit(page, { num_qubits: 5, num_clbits: 0, operations });
  await selectEngineLane(page, "SV");
  await enableStateAnalysis(page, { detail: "full" });
  await runAndOpenQuantumState(page);
  await page.getByRole("button", { name: "Probabilities" }).click();
  await page.waitForTimeout(300);

  const stats = await page.evaluate(() => {
    const tables = [...document.querySelectorAll("table")];
    const table = tables.find((t) => t.getAttribute("aria-rowcount"));
    if (!table) return null;
    const rows = [...table.querySelectorAll("tbody tr")].filter((r) => !r.hasAttribute("aria-hidden"));
    return { ariaRowCount: table.getAttribute("aria-rowcount"), domRows: rows.length };
  });
  console.log("VIRTUALIZATION:", JSON.stringify(stats));
  expect(Number(stats!.ariaRowCount)).toBe(33); // 32 states + header
  expect(stats!.domRows).toBeLessThan(32); // windowed, not fully mounted

  // Scroll the window and confirm later rows materialize.
  const container = page.locator("table[aria-rowcount]").first().locator("xpath=ancestor::div[contains(@class,'overflow-y-auto')][1]");
  await container.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await page.waitForTimeout(200);
  await expect(page.getByText("|11111⟩")).toBeVisible();
  console.log("scrolled to bottom, |11111> visible");

  // Search narrows to 1 row.
  await page.getByLabel("Filter basis states").first().fill("11111");
  await expect(page.getByText(/1 of 32 states/)).toBeVisible();
  await page.screenshot({ path: "verify-virtualized.png", fullPage: false });
});
