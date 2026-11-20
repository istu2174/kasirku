import { defineConfig } from "@playwright/test";

// Pakai Chrome yang sudah terpasang (tanpa `npx playwright install`).
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
