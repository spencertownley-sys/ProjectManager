import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx", "components/**/*.test.tsx", "tests/**/*.test.ts"],
    coverage: { provider: "v8", include: ["lib/**"], reporter: ["text", "lcov"] },
    testTimeout: 20000,
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
});
