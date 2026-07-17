import { defineConfig, devices } from "@playwright/test";

// Throwaway config for manual verification against an already-running dev
// server + real backend. Not part of the committed test suite.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /zzz-.*\.spec\.ts/,
  timeout: 45_000,
  use: {
    baseURL: "http://localhost:3130",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
