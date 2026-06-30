import type { AdminPermission, UserRole } from "@club/shared";

export type AdminPanel = "statistics" | "users" | "mailings" | "payments" | "materials" | "storage" | "admins";
export type AdminPanelRole = UserRole | undefined;

export type AdminPanelDefinition = {
  id: AdminPanel;
  label: string;
  ownerOnly?: boolean;
  permission?: AdminPermission;
};

export const adminPanelDefinitions: AdminPanelDefinition[] = [
  { id: "statistics", label: "Статистика", permission: "statistics" },
  { id: "users", label: "Клиенты", permission: "users" },
  { id: "mailings", label: "Рассылки", permission: "mailings" },
  { id: "payments", label: "Платежи", permission: "payments" },
  { id: "materials", label: "Контент", permission: "materials" },
  { id: "storage", label: "Хранилище", permission: "storage" },
  { id: "admins", label: "Админы", permission: "admins" }
];

export function getVisibleAdminPanels(role: AdminPanelRole, permissions?: AdminPermission[]) {
  if (role === "owner") {
    return adminPanelDefinitions;
  }

  if (role !== "admin") {
    return [];
  }

  const allowedPermissions = permissions ? new Set(permissions) : null;

  return adminPanelDefinitions.filter(
    (panel) => !panel.ownerOnly && (!panel.permission || !allowedPermissions || allowedPermissions.has(panel.permission))
  );
}
