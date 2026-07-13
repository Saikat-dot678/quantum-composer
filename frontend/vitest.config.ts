import { defineConfig } from "vitest/config";
import path from "node:path";

// Pure-logic unit tests (lib/): coordinate conversion, placement/snapping
// validation, matrix and decomposition validation for custom gates. Component
// and workflow-level behavior stays in e2e/ (Playwright) — this config
// intentionally has no DOM environment, since none of these tests render UI.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
