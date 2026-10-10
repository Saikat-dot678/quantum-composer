import { defineConfig } from "vitest/config";
import path from "node:path";

// DOM workflow regressions opt in with the per-file jsdom directive.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.tsx"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
