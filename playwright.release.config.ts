import { defineConfig, devices } from "@playwright/test";
import baseConfig from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  retries: process.env.CI ? 1 : 0,
  grep: /keeps core sections inside the mobile viewport|keeps application page headers aligned|does not double-scroll iPhone support composers|opens payment admin task screens when their URLs are loaded directly|keeps design theme independent from day and night mode/,
  projects: [
    { name: "release-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "release-firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "release-android", use: { ...devices["Pixel 7"] } },
    { name: "ios-safari-webkit", use: { ...devices["iPhone 15"], browserName: "webkit" as const } }
  ]
});
