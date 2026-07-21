import type { AdminPermission, UserRole } from "@club/shared";

export type AdminPanel =
  | "statistics"
  | "users"
  | "mailings"
  | "payments"
  | "storage"
  | "project-settings"
  | "admins"
  | "server-logs";
export type AdminPanelRole = UserRole | undefined;
export type AdminTaskAccess = AdminPanel | "owner-only" | "developer-only";

export type AdminPanelDefinition = {
  id: AdminPanel;
  label: string;
  ownerOnly?: boolean;
  permission?: AdminPermission;
};

export const adminPanelDefinitions: AdminPanelDefinition[] = [
  { id: "statistics", label: "Аналитика", permission: "statistics" },
  { id: "users", label: "Клиенты", permission: "users" },
  { id: "mailings", label: "Рассылки", permission: "mailings" },
  { id: "payments", label: "Платежи", permission: "payments" },
  { id: "storage", label: "Хранилище", permission: "storage" },
  { id: "project-settings", label: "Настройки проекта", permission: "project_settings" },
  { id: "admins", label: "Админы", permission: "admins" },
  { id: "server-logs", label: "Сервер", ownerOnly: true }
];

export function getVisibleAdminPanels(role: AdminPanelRole, permissions?: AdminPermission[]) {
  if (role === "owner") {
    return adminPanelDefinitions;
  }

  if (role !== "admin") {
    return [];
  }

  const allowedPermissions = new Set(permissions ?? []);

  return adminPanelDefinitions.filter(
    (panel) => !panel.ownerOnly && (!panel.permission || allowedPermissions.has(panel.permission))
  );
}

export function getAdminPanelForTaskPath(path: string): AdminTaskAccess | null {
  if (/^\/admin\/owner(?:\/|$)/.test(path)) return "owner-only";
  if (path === "/admin/releases") return "developer-only";
  if (/^\/admin\/mailings(?:\/|$)/.test(path)) return "mailings";
  if (/^\/admin\/clients(?:\/|$)/.test(path)) return "users";
  if (/^\/admin\/storage(?:\/|$)/.test(path)) return "storage";
  if (/^\/admin\/server(?:\/|$)/.test(path)) return "server-logs";
  if (/^\/admin\/admins(?:\/|$)/.test(path)) return "admins";
  if (/^\/admin\/statistics(?:\/|$)/.test(path)) return "statistics";
  return null;
}
