import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);

test("renders the mini app shell without accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Клуб" })).toBeVisible();

  await page.addScriptTag({
    content: readFileSync(require.resolve("axe-core/axe.min.js"), "utf8")
  });

  const results = await page.evaluate(async () => {
    return window.axe.run();
  });

  expect(results.violations).toEqual([]);
});
