import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Node environment for API route tests and storage logic.
    environment: "node",
    // Shared setup for MSW and test env vars.
    setupFiles: ["./tests/setup.ts"],
    // Keep tests in the `tests` folder for consistency.
    include: ["tests/**/*.test.ts"]
  },
  resolve: {
    alias: {
      // Match app tsconfig alias for cleaner imports.
      "@": path.resolve(__dirname, "./")
    }
  }
});
