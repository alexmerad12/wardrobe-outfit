// Audit-session variant of playwright.config.ts: runs on port 3001 because
// another project occupies localhost:3000 on this machine. Safe to delete.
import baseConfig from "./playwright.config";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  ...baseConfig,
  use: {
    ...baseConfig.use,
    baseURL: "http://localhost:3001",
  },
  webServer: {
    ...(baseConfig.webServer as object),
    command: "npm run dev -- -p 3001",
    url: "http://localhost:3001",
  },
});
