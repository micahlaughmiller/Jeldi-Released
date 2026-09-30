import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Unit tests only. server/tests/*.test.js needs a running server and is run separately.
    include: ["server/**/__tests__/**/*.test.ts", "shared/**/__tests__/**/*.test.ts"],
    setupFiles: ["./server/__tests__/setup.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@": path.resolve(import.meta.dirname, "client", "src"),
    },
  },
});
