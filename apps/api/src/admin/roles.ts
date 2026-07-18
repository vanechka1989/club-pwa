import { eq, inArray } from "drizzle-orm";
import { allAdminPermissions, adminPermissionSchema, type AdminPermission, type UserRole } from "@club/shared";
import { db } from "../db/client";
import { adminUsers, clubSettings } from "../db/schema";
import { env } from "../env";

export const ownerTelegramIdSettingKey = "club_owner_telegram_id";
export const ownerEmailSettingKey = "club_owner_email";

export async function getOwnerTelegramId() {
  const settings = await db.query.clubSettings.findMany({
    where: inArray(clubSettings.key, [ownerEmailSettingKey, ownerTelegramIdSettingKey])
  });
  const emailSetting = settings.find((setting) => setting.key === ownerEmailSettingKey);
  const legacySetting = settings.find((setting) => setting.key === ownerTelegramIdSettingKey);

  return (emailSetting?.value ?? legacySetting?.value ?? env.OWNER_EMAIL).toLowerCase();
}

export async function isOwnerTelegramId(telegramId: string) {
  return telegramId.toLowerCase() === (await getOwnerTelegramId());
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
      isOwner: true,
      roleLabel: "Владелец",
      isActive: true,
      permissions: [...allAdminPermissions]
    };
  }

  const admin = await db.query.adminUsers.findFirst({
    where: eq(adminUsers.telegramId, telegramId)
  });

  if (!admin || !admin.isActive) {
    return {
      isOwner: false,
      roleLabel: admin?.roleLabel ?? null,
      isActive: false,
      permissions: normalizeAdminPermissions(admin?.permissions)
    };
  }

  return {
    isOwner: false,
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

  const admin = await db.query.adminUsers.findFirst({
    where: eq(adminUsers.telegramId, telegramId)
  });

  return admin?.isActive ? "admin" : "member";
}

export async function requireOwnerRole(telegramId: string) {
  return isOwnerTelegramId(telegramId);
}
