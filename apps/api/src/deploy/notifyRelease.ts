import { and, eq } from "drizzle-orm";
import { currentRelease } from "@club/shared";
import { getOwnerTelegramId } from "../admin/roles";
import { db, postgresClient } from "../db/client";
import { appNotifications, users } from "../db/schema";
import { createAppNotification } from "../notifications/create";
import { ensureOwnerReleaseNotification } from "./releaseNotification";

try {
  const result = await ensureOwnerReleaseNotification(currentRelease, {
    async findOwnerUserId() {
      const ownerIdentity = await getOwnerTelegramId();
      const owner = await db.query.users.findFirst({
        where: eq(users.telegramId, ownerIdentity)
      });
      return owner?.id ?? null;
    },
    async hasReleaseNotification(userId, title) {
      const existing = await db.query.appNotifications.findFirst({
        where: and(
          eq(appNotifications.userId, userId),
          eq(appNotifications.source, "release"),
          eq(appNotifications.title, title)
        )
      });
      return Boolean(existing);
    },
    createNotification: (input) => createAppNotification(input, { waitForPush: true })
  });
  console.log(JSON.stringify(result));
} finally {
  await postgresClient.end();
}
