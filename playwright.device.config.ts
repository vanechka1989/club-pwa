import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";
import { fullProjects } from "./tests/e2e/playwrightProjects";

export default defineConfig({
  ...baseConfig,
  grep: /keeps core sections inside the mobile viewport|keeps application page headers aligned|does not double-scroll iPhone support composers/,
  projects: fullProjects.filter((project) => project.name !== "desktop-chrome")
});
