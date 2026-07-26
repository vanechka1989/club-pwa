import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { routeCssCategories } from "./routeCssConfig.mjs";
import { splitRouteCss } from "./routeCssSplitter.mjs";

const routeTargets = {
  profile: "src/features/profile/profileRoute.css",
  learning: "src/features/learning/learningRoute.css",
  support: "src/features/support/supportRoute.css",
  billing: "src/features/billing/billingRoute.css",
  admin: "src/features/admin/adminRoute.css",
  notification: "src/features/app/notificationRoute.css",
  community: "src/features/community/communityRoute.css"
};

export function splitRouteCssSource(webRoot) {
  const stylesPath = resolve(webRoot, "src/styles.css");
  const result = splitRouteCss(readFileSync(stylesPath, "utf8"), routeCssCategories);
  writeFileSync(stylesPath, `${result.globalCss.trimEnd()}\n`);

  for (const [route, relativePath] of Object.entries(routeTargets)) {
    writeFileSync(resolve(webRoot, relativePath), `${result.routeCss[route].trim()}\n`);
  }

  return result.counts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
  console.log(JSON.stringify(splitRouteCssSource(resolve(scriptDirectory, "..")), null, 2));
}

