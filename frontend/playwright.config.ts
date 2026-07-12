import { defineConfig, devices } from "@playwright/test";

// Frontend smoke suite. It runs against a production `next start` on a
// dedicated port and does NOT require the FastAPI backend: the shell must
// render an honest offline state when the API is unreachable, and these tests
// assert exactly that baseline plus mode navigation.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3130",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start -- -p 3130",
    url: "http://127.0.0.1:3130",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
