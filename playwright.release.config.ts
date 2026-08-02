import { defineConfig, devices } from "@playwright/test";
import baseConfig from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  retries: process.env.CI ? 1 : 0,
  grep: /keeps core sections inside the mobile viewport|keeps application page headers aligned|does not double-scroll iPhone support composers|opens payment admin task screens when their URLs are loaded directly|opens a personal payment offer without viewport overflow|keeps design theme independent from day and night mode|opens actionable admin attention items without double-counting|renders visual admin analytics overview without viewport overflow|keeps compact admin navigation reachable on every release viewport|shows a clear learning path with progress and lesson navigation/,
  projects: [
    { name: "release-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "release-firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "release-android", use: { ...devices["Pixel 7"] } },
    { name: "ios-safari-webkit", use: { ...devices["iPhone 15"], browserName: "webkit" as const } }
  ]
});
