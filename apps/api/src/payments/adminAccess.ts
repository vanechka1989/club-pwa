import type { AdminPermission, UserRole } from "@club/shared";

export function canReadPaymentSettings(role: UserRole, permissions: AdminPermission[] = []) {
  return role === "owner" || (role === "admin" && (permissions.includes("payments") || permissions.includes("statistics")));
}

export function canManagePaymentSettings(role: UserRole, permissions: AdminPermission[] = []) {
  return role === "owner" || (role === "admin" && permissions.includes("payments"));
}
