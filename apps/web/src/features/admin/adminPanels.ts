export type AdminPanel = "statistics" | "overview" | "users" | "payments" | "materials" | "mockups" | "admins";
export type AdminPanelRole = "member" | "admin" | "owner" | undefined;

export type AdminPanelDefinition = {
  id: AdminPanel;
  label: string;
  ownerOnly?: boolean;
};

export const adminPanelDefinitions: AdminPanelDefinition[] = [
  { id: "statistics", label: "Статистика" },
  { id: "overview", label: "Обзор" },
  { id: "users", label: "Клиенты" },
  { id: "payments", label: "Платежи" },
  { id: "mockups", label: "Макеты", ownerOnly: true },
  { id: "admins", label: "Админы" }
];

export function getVisibleAdminPanels(role: AdminPanelRole) {
  return adminPanelDefinitions.filter((panel) => !panel.ownerOnly || role === "owner");
}
