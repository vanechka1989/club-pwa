import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sourceRoot = resolve(__dirname, "..");
const routeStyles = {
  profile: "features/profile/profileRoute.css",
  learning: "features/learning/learningRoute.css",
  support: "features/support/supportRoute.css",
  billing: "features/billing/billingRoute.css",
  admin: "features/admin/adminRoute.css",
  notification: "features/app/notificationRoute.css",
  community: "features/community/communityRoute.css"
} as const;

type RouteStyleName = keyof typeof routeStyles;

function read(relativePath: string) {
  return readFileSync(resolve(sourceRoot, relativePath), "utf8");
}

export function readAppStyles(route?: RouteStyleName) {
  const paths = route ? [routeStyles[route]] : Object.values(routeStyles);
  return [read("styles.css"), ...paths.map(read)].join("\n");
}
