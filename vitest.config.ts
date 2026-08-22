import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    fileParallelism: false, // tests share one DB — run sequentially to avoid cross-test interference
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
