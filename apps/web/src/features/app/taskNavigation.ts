import type { AppSection } from "./navigation";

const sectionPaths: Record<AppSection, string> = {
  profile: "/profile",
  learning: "/learning",
  community: "/community",
  payments: "/payments",
  support: "/support",
  admin: "/admin"
};

export const taskRoutePaths = [
  "/notifications",
  "/profile/avatar",
  "/support/new",
  "/support/tickets/:ticketId",
  "/admin/clients/:customerId",
  "/admin/statistics/payments/:segment",
  "/admin/statistics/users/:segment",
  "/admin/releases",
  "/admin/mailings/new",
  "/admin/mailings/:mailingId",
  "/admin/storage/files",
  "/admin/storage/folders/:folderId",
  "/admin/storage/settings",
  "/admin/server/logs",
  "/admin/owner/transfer",
  "/admin/admins/:adminId/access",
  "/payments/provider",
  "/payments/plans/new",
  "/payments/plans/:planId/edit",
  "/learning/modules/new",
  "/learning/modules/:moduleId/edit",
  "/learning/lessons/new/:moduleId",
  "/learning/lessons/:lessonId",
  "/learning/lessons/:lessonId/edit"
] as const;

function normalizePath(path: string) {
  const cleanPath = path.split(/[?#]/, 1)[0] || "/";
  return cleanPath.length > 1 ? cleanPath.replace(/\/+$/, "") : cleanPath;
}

function pathMatches(pattern: string, path: string) {
  const patternSegments = normalizePath(pattern).split("/").filter(Boolean);
  const pathSegments = normalizePath(path).split("/").filter(Boolean);
  return (
    patternSegments.length === pathSegments.length &&
    patternSegments.every((segment, index) => segment.startsWith(":") || segment === pathSegments[index])
  );
}

export function sectionPath(section: AppSection) {
  return sectionPaths[section];
}

export function sectionFromPath(path: string): AppSection {
  const firstSegment = normalizePath(path).split("/").filter(Boolean)[0];
  if (firstSegment === "learning" || firstSegment === "community" || firstSegment === "payments" || firstSegment === "support" || firstSegment === "admin") {
    return firstSegment;
  }
  return "profile";
}

export function isTaskPath(path: string) {
  return taskRoutePaths.some((pattern) => pathMatches(pattern, path));
}
