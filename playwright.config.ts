import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  use: {
    storageState: process.env.E2E_AUTH_STORAGE_STATE || undefined,
    baseURL: process.env.PWA_TEST
      ? "http://127.0.0.1:4173"
      : "http://127.0.0.1:5173",
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: process.env.PWA_TEST
      ? "node node_modules/vite/bin/vite.js preview --host 127.0.0.1"
      : "node node_modules/vite/bin/vite.js --host 127.0.0.1",
    url: process.env.PWA_TEST
      ? "http://127.0.0.1:4173"
      : "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
