import { expect, test } from "@playwright/test";

// Backend-DEPENDENT workflow tests. Unlike smoke/a11y/visual (which
// deliberately run against an offline backend, per playwright.config.ts),
// these exercise real FastAPI round-trips: run, analyze, engine selection,
// and protocol execution. Run the backend locally first:
//   cd backend && python -m uvicorn main:app --port 8000
// Each test skips itself (not the whole file) if the backend is unreachable,
// so the rest of the suite stays green in environments without it running.
async function requireBackend(): Promise<boolean> {
  try {
    const response = await fetch("http://localhost:8000/health");
    return response.ok;
  } catch {
    return false;
  }
}

test.beforeEach(async () => {
  test.skip(!(await requireBackend()), "Backend not reachable at http://localhost:8000 - start FastAPI to run this test.");
});

test("running the default circuit populates the results dock", async ({ page }) => {
  await page.goto("/composer");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Code & results.*[\d,]+ shots/)).toBeVisible({ timeout: 15_000 });
});

test("analyzing the circuit shows backend-verified feasibility in the inspector", async ({ page }) => {
  await page.goto("/composer");
  await page.getByRole("button", { name: "Analyze" }).click();
  await expect(page.getByText("Backend analysis")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Clifford/)).toBeVisible();
});

test("Open in Simulator Lab hands off the live Composer circuit", async ({ page }) => {
  await page.goto("/composer");
  await page.getByRole("button", { name: "Simulator Lab" }).click();
  await expect(page).toHaveURL(/\/simulator/);
  await expect(page.getByText("Live Composer circuit").first()).toBeVisible();
});

test("selecting an engine lane in Simulator Lab updates the selected route", async ({ page }) => {
  await page.goto("/simulator");
  await page.waitForTimeout(800); // circuit analysis round-trip on load
  await page.getByRole("tab", { name: /^DM/ }).click();
  const selectedRoute = await page.evaluate(() => {
    const label = Array.from(document.querySelectorAll("span")).find((el) => el.textContent?.toLowerCase() === "selected route");
    return label?.nextElementSibling?.textContent ?? null;
  });
  expect(selectedRoute).toMatch(/Density/i);
});

test("BB84 with Eve enabled runs and shows a disturbance-aware result", async ({ page }) => {
  await page.goto("/crypto");
  const eveToggle = page.getByText("Insert Eve disturbance").locator("..").getByRole("switch").first();
  if (await eveToggle.count() > 0) await eveToggle.click();
  else await page.getByText("Insert Eve disturbance").click();
  await page.getByRole("button", { name: /^Run BB84/ }).last().click();
  await expect(page.getByText(/QBER/i).first()).toBeVisible({ timeout: 15_000 });
});
