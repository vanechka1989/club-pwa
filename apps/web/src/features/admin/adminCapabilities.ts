import type { AdminPermission, UserRole } from "@club/shared";

export function hasAdminCapability(
  role: UserRole | null | undefined,
  permissions: AdminPermission[] | null | undefined,
  permission: AdminPermission
) {
  if (role === "owner") {
    return true;
  }

  return role === "admin" && Boolean(permissions?.includes(permission));
}
