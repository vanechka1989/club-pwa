import { defineConfig, devices } from "@playwright/test";
import baseConfig from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  grep: /keeps core sections inside the mobile viewport|keeps application page headers aligned|does not double-scroll iPhone support composers/,
  projects: [
    { name: "release-android", use: { ...devices["Pixel 7"] } },
    { name: "ios-safari-webkit", use: { ...devices["iPhone 15"] } }
  ]
});
