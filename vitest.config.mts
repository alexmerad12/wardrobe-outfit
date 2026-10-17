// Unit tests (pure logic, no network, no browser): `npm run test:unit`.
// The browser and endpoint suites stay in Playwright (tests/e2e).
// .mts: the package is CommonJS-typed, and Vite wants an ESM config.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
