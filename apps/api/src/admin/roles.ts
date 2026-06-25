import { eq } from "drizzle-orm";
import type { UserRole } from "@club/shared";
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

  return admin ? "admin" : "member";
}

export async function requireOwnerRole(telegramId: string) {
  return isOwnerTelegramId(telegramId);
}
