import { eq } from "drizzle-orm";
import { allAdminPermissions, adminPermissionSchema, type AdminPermission, type UserRole } from "@club/shared";
import { db } from "../db/client";
import { adminUsers, clubSettings } from "../db/schema";
import { env } from "../env";

export const ownerTelegramIdSettingKey = "club_owner_telegram_id";

function parseAdminIds() {
  return env.ADMIN_TELEGRAM_IDS.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function getOwnerTelegramId() {
  const setting = await db.query.clubSettings.findFirst({
    where: eq(clubSettings.key, ownerTelegramIdSettingKey)
  });

  return setting?.value ?? env.OWNER_TELEGRAM_ID;
}

export async function isOwnerTelegramId(telegramId: string) {
  return telegramId === (await getOwnerTelegramId());
}

export function normalizeAdminPermissions(value: unknown): AdminPermission[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const permissions = value.filter((entry): entry is AdminPermission => adminPermissionSchema.safeParse(entry).success);
  return Array.from(new Set(permissions));
}

export async function getAdminAccessProfile(telegramId: string) {
  if (await isOwnerTelegramId(telegramId)) {
    return {
      roleLabel: "Владелец",
      isActive: true,
      permissions: [...allAdminPermissions]
    };
  }

  if (parseAdminIds().includes(telegramId)) {
    return {
      roleLabel: "Админ",
      isActive: true,
      permissions: [...allAdminPermissions]
    };
  }

  const admin = await db.query.adminUsers.findFirst({
    where: eq(adminUsers.telegramId, telegramId)
  });

  if (!admin || !admin.isActive) {
    return {
      roleLabel: admin?.roleLabel ?? null,
      isActive: false,
      permissions: normalizeAdminPermissions(admin?.permissions)
    };
  }

  return {
    roleLabel: admin.roleLabel,
    isActive: admin.isActive,
    permissions: normalizeAdminPermissions(admin.permissions)
  };
}

export async function hasAdminPermission(telegramId: string, permission: AdminPermission) {
  const profile = await getAdminAccessProfile(telegramId);
  return profile.isActive && profile.permissions.includes(permission);
}

export async function getUserRole(telegramId: string): Promise<UserRole> {
  if (await isOwnerTelegramId(telegramId)) {
    return "owner";
  }

  if (parseAdminIds().includes(telegramId)) {
    return "admin";
  }

  const admin = await db.query.adminUsers.findFirst({
    where: eq(adminUsers.telegramId, telegramId)
  });

  return admin?.isActive ? "admin" : "member";
}

export async function requireOwnerRole(telegramId: string) {
  return isOwnerTelegramId(telegramId);
}
