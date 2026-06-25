import type { UserRole } from "@club/shared";

export function canReadPaymentSettings(role: UserRole) {
  return role === "admin" || role === "owner";
}

export function canManagePaymentSettings(role: UserRole) {
  return role === "owner";
}
