import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: { baseURL: "http://localhost:3100", headless: true, channel: "msedge" },
  webServer: { command: "npm run start -- --port 3100", url: "http://localhost:3100", reuseExistingServer: false, timeout: 90_000 },
});
