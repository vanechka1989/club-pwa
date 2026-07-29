import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { appNotifications } from "../db/schema";
import { logger } from "../logger";
import { sendWebPushToUser } from "../push/webPush";

export type CreateAppNotificationInput = {
  userId: string;
  kind?: "system" | "support" | "payment" | "client" | "mailing";
  title: string;
  body: string;
  bodyHtml?: string | null;
  source?: string | null;
  sourceId?: string | null;
  deduplicate?: boolean;
  pushUrl?: string;
  attachment?: {
    kind: "photo" | "video" | "document";
    fileName: string;
    objectKey: string;
    contentType: string;
    sizeBytes: number;
  } | null;
};

export type CreateAppNotificationOptions = {
  waitForPush?: boolean;
  activeCommunityMessageId?: string;
};

type CreateAppNotificationDependencies = {
  database: typeof db;
  sendWebPushToUser: typeof sendWebPushToUser;
  logger: Pick<typeof logger, "warn">;
};

export function createAppNotificationService(dependencies: CreateAppNotificationDependencies) {
  const insertNotification = async (database: typeof db, input: CreateAppNotificationInput) => {
    const [notification] = await database.insert(appNotifications).values({
      userId: input.userId,
      kind: input.kind ?? "system",
      title: input.title,
      body: input.body,
      bodyHtml: input.bodyHtml ?? null,
      source: input.source ?? null,
      sourceId: input.sourceId ?? null,
      attachmentKind: input.attachment?.kind ?? null,
      attachmentFileName: input.attachment?.fileName ?? null,
      attachmentObjectKey: input.attachment?.objectKey ?? null,
      attachmentContentType: input.attachment?.contentType ?? null,
      attachmentSizeBytes: input.attachment?.sizeBytes ?? null
    }).returning();
    return notification ?? null;
  };

  const persistNotification = async (database: typeof db, input: CreateAppNotificationInput) => {
    if (!(input.deduplicate && input.source && input.sourceId)) {
      return { notification: await insertNotification(database, input), created: true };
    }

    const deduplicationKey = `${input.userId}:${input.source}:${input.sourceId}`;
    await database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${deduplicationKey}, 0))`);
    const existing = await database.query.appNotifications.findFirst({
      where: and(
        eq(appNotifications.userId, input.userId),
        eq(appNotifications.source, input.source),
        eq(appNotifications.sourceId, input.sourceId)
      )
    });
    if (existing) return { notification: existing, created: false };
    return { notification: await insertNotification(database, input), created: true };
  };

  const deliverPush = async (
    input: CreateAppNotificationInput,
    options: CreateAppNotificationOptions
  ) => {
    const delivery = dependencies.sendWebPushToUser(input.userId, {
      title: input.title,
      body: input.body,
      url: input.pushUrl ?? "/"
    });
    if (options.waitForPush) {
      await delivery;
      return;
    }
    void delivery.catch((error) => {
      dependencies.logger.warn({ error, userId: input.userId }, "app notification push failed");
    });
  };

  return async function createAppNotificationWithDependencies(
    input: CreateAppNotificationInput,
    options: CreateAppNotificationOptions = {}
  ) {
    if (options.activeCommunityMessageId) {
      const persisted = await dependencies.database.transaction(async (transaction) => {
        const database = transaction as unknown as typeof db;
        const activeRows = Array.from((await database.execute(sql`
          select id
          from club_chat_messages
          where id = ${options.activeCommunityMessageId}
            and status = 'visible'
            and deleted_by_user_at is null
          for share
        `)) as Iterable<{ id: string }>);
        if (!activeRows.length) return null;

        const persisted = await persistNotification(database, input);
        return persisted;
      });
      if (persisted?.notification && persisted.created) {
        await deliverPush(input, options);
      }
      return persisted?.notification ?? null;
    }

    const persisted = input.deduplicate && input.source && input.sourceId
      ? await dependencies.database.transaction((transaction) =>
          persistNotification(transaction as unknown as typeof db, input))
      : await persistNotification(dependencies.database, input);

    if (persisted.notification && persisted.created) {
      await deliverPush(input, options);
    }
    return persisted.notification;
  };
}

export const createAppNotification = createAppNotificationService({
  database: db,
  sendWebPushToUser,
  logger
});
