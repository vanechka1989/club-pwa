import { eq } from "drizzle-orm";
import type { UserRole } from "@club/shared";
import { db } from "../db/client";
import { adminUsers } from "../db/schema";
import { env } from "../env";

function parseAdminIds() {
  return env.ADMIN_TELEGRAM_IDS.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isOwnerTelegramId(telegramId: string) {
  return telegramId === env.OWNER_TELEGRAM_ID;
}

export async function getUserRole(telegramId: string): Promise<UserRole> {
  if (isOwnerTelegramId(telegramId)) {
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
