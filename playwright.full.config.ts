import { defineConfig } from "@playwright/test";
import { fullProjects } from "./tests/e2e/playwrightProjects";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  webServer: {
    command: "pnpm --filter @club/web exec vite --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    screenshot: "only-on-failure",
    trace: "on-first-retry"
  },
  projects: fullProjects
});
