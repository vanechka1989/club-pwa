import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AdminLearningMaterial, AdminUserDetailResponse, AdminUserModerationEvent, AdminStatsUser, ContentKind, MembershipStatus } from "@club/shared";
import { getOwnerTelegramId, getUserRole, isOwnerTelegramId, ownerTelegramIdSettingKey } from "../admin/roles";
import { validateOwnerTransferTarget } from "../admin/ownerTransfer";
import { db } from "../db/client";
import {
  adminUsers,
  clubSettings,
  clubChatMessages,
  contentCategories,
  contentItems,
  lessonComments,
  subscriptions,
  userContentProgress,
  userMutes,
  users
} from "../db/schema";
import { env } from "../env";
import { getMembership } from "../membership/getMembership";
import { getActiveMute } from "../moderation/mutes";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { deleteObject, getObjectReadUrl, testS3Connection, uploadObject } from "../storage/s3";
import {
  buildS3SettingsResponse,
  getS3ConfigFromEnv,
  getS3ConfigFromSetting,
  normalizeS3PublicBaseUrl,
  storageSettingKey,
  type StoredS3Config
} from "../storage/s3Config";
import { getMessagePurgeAt, shouldHardDeleteMessages } from "../community/messageDeletion";
import { getRestoredContentArchiveValues } from "../learning/contentArchive";
import { buildLearningMediaObjectKey, buildLearningThumbnailObjectKey, getLearningMediaUploadContentType } from "../learning/mediaUpload";
import {
  decodeModuleCategoryDescription,
  encodeModuleCategoryDescription,
  isModuleCategoryDescription
} from "../learning/moduleCategory";

const adminPayloadSchema = z.object({
  telegramId: z.string().trim().regex(/^\d{3,32}$/)
});

const ownerTransferPayloadSchema = z.object({
  telegramId: z.string().trim().regex(/^\d{3,32}$/)
});

const accessPayloadSchema = z.object({
  telegramId: z.string().trim().regex(/^\d{3,32}$/),
  status: z.enum(["inactive", "active", "expired"]),
  expiresAt: z.string().datetime().nullable().optional()
});

const moderationStatusPayloadSchema = z.object({
  status: z.enum(["visible", "hidden", "deleted"]),
  reason: z.string().trim().max(1000).nullable().optional()
});

const mutePayloadSchema = z.object({
  telegramId: z.string().trim().regex(/^\d{3,32}$/),
  kind: z.enum(["temporary", "permanent"]),
  reason: z.string().trim().max(1000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional()
});

const materialStatusPayloadSchema = z.object({
  isPublished: z.boolean()
});

const categoryStatusPayloadSchema = z.object({
  isPublished: z.boolean()
});

const learningCategoryPayloadSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).nullable().optional()
});

const s3StoragePayloadSchema = z.object({
  endpoint: z.string().trim().url(),
  region: z.string().trim().min(1).default("us-east-1"),
  bucket: z.string().trim().min(1),
  accessKeyId: z.string().trim().optional(),
  secretAccessKey: z.string().trim().optional(),
  publicBaseUrl: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().url().nullable().optional()
  ),
  signedUrlTtlSeconds: z.coerce.number().int().positive().max(86_400).default(3600)
});

const contentKinds = ["text", "photo", "video", "audio"] as const;
const contentArchiveTtlMs = 7 * 24 * 60 * 60 * 1000;

function activeContentWhere() {
  return or(isNull(contentItems.archivedUntil), gt(contentItems.archivedUntil, new Date()));
}

function getFormValue(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: string) {
  return value.length ? value : null;
}

function createCategorySlug(title: string) {
  const readable = title
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `${readable || "category"}-${randomUUID().slice(0, 8)}`;
}

async function uploadMaterialFile(kind: ContentKind, file: File) {
  const contentType = getLearningMediaUploadContentType(kind, file.type || "application/octet-stream", file.name);
  if (!contentType) {
    return null;
  }

  const key = buildLearningMediaObjectKey({
    kind,
    fileName: file.name,
    id: randomUUID(),
    now: new Date()
  });
  const upload = await uploadObject({
    key,
    body: new Uint8Array(await file.arrayBuffer()),
    contentType
  });

  return {
    objectKey: upload.key,
    contentType,
    sizeBytes: file.size
  };
}

async function uploadThumbnailFile(file: File) {
  const contentType = file.type || "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    return null;
  }

  const key = buildLearningThumbnailObjectKey({
    fileName: file.name,
    id: randomUUID(),
    now: new Date()
  });
  const upload = await uploadObject({
    key,
    body: new Uint8Array(await file.arrayBuffer()),
    contentType
  });

  return {
    objectKey: upload.key,
    contentType,
    sizeBytes: file.size
  };
}

async function serializeAdminMaterial(item: typeof contentItems.$inferSelect): Promise<AdminLearningMaterial> {
  const mediaUrl = item.mediaObjectKey ? await getObjectReadUrl(item.mediaObjectKey) : item.mediaUrl;
  const thumbnailUrl = item.thumbnailObjectKey ? await getObjectReadUrl(item.thumbnailObjectKey) : item.thumbnailUrl;

  return {
    id: item.id,
    categoryId: item.categoryId,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    body: item.body,
    mediaUrl,
    thumbnailUrl,
    cardLayout: item.cardLayout === "horizontal" ? "horizontal" : "vertical",
    mediaContentType: item.mediaContentType,
    mediaSizeBytes: item.mediaSizeBytes,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    isPublished: item.isPublished,
    archivedUntil: item.archivedUntil?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

async function purgeExpiredArchivedContent() {
  const expiredItems = await db.query.contentItems.findMany({
    where: and(isNotNull(contentItems.archivedUntil), lt(contentItems.archivedUntil, new Date()))
  });

  for (const item of expiredItems) {
    if (item.mediaObjectKey) {
      await deleteObject(item.mediaObjectKey).catch(() => null);
    }
    if (item.thumbnailObjectKey) {
      await deleteObject(item.thumbnailObjectKey).catch(() => null);
    }
  }

  if (expiredItems.length) {
    for (const item of expiredItems) {
      await db.delete(contentItems).where(eq(contentItems.id, item.id));
    }
  }
}

async function getPublishedItemsCount() {
  const [row] = await db
    .select({
      value: count(contentItems.id)
    })
    .from(contentItems)
    .where(eq(contentItems.isPublished, true));

  return row?.value ?? 0;
}

async function buildStatsUser(user: typeof users.$inferSelect, totalItems: number): Promise<AdminStatsUser> {
  const membership = await getMembership(user.id);
  const role = await getUserRole(user.telegramId);
  const activeMute = await getActiveMute(user.id);
  const [completedRow] = await db
    .select({
      value: count(userContentProgress.id)
    })
    .from(userContentProgress)
    .where(and(eq(userContentProgress.userId, user.id), isNotNull(userContentProgress.completedAt)));

  const lastOpened = await db.query.userContentProgress.findFirst({
    where: eq(userContentProgress.userId, user.id),
    orderBy: [desc(userContentProgress.lastOpenedAt)],
    with: {
      item: true
    }
  });

  return {
    id: user.id,
    telegramId: user.telegramId,
    firstName: user.firstName,
    username: user.username,
    photoUrl: user.photoUrl,
    role,
    membershipStatus: membership.status,
    membershipExpiresAt: membership.subscription?.expiresAt?.toISOString() ?? null,
    tariff: membership.subscription?.provider ?? null,
    hasRestrictions: Boolean(activeMute),
    completedItems: completedRow?.value ?? 0,
    totalItems,
    lastOpenedItemTitle: lastOpened?.item?.title ?? null,
    lastOpenedAt: lastOpened?.lastOpenedAt.toISOString() ?? null,
    createdAt: user.createdAt.toISOString()
  };
}

async function canManageTarget(actorTelegramId: string, targetTelegramId: string) {
  if (await isOwnerTelegramId(actorTelegramId)) {
    return true;
  }

  return (await getUserRole(targetTelegramId)) === "member";
}

async function rejectIfCannotManageTarget(c: Context<{ Variables: AuthVariables }>, targetTelegramId: string) {
  if (await canManageTarget(c.get("telegramUser").id, targetTelegramId)) {
    return null;
  }

  return c.json({ error: "Only the owner can manage admins or the owner" }, 403);
}

async function rejectIfNotOwner(c: Context<{ Variables: AuthVariables }>) {
  if (await isOwnerTelegramId(c.get("telegramUser").id)) {
    return null;
  }

  return c.json({ error: "Owner access required" }, 403);
}

async function getStoredS3Setting() {
  const setting = await db.query.clubSettings.findFirst({
    where: eq(clubSettings.key, storageSettingKey)
  });

  return {
    setting,
    config: getS3ConfigFromSetting(setting?.value)
  };
}

function buildActiveS3SettingsResponse(setting: typeof clubSettings.$inferSelect | undefined, storedConfig: StoredS3Config | null) {
  const envConfig = getS3ConfigFromEnv(env);
  const activeConfig = storedConfig ?? envConfig;

  return buildS3SettingsResponse({
    config: activeConfig,
    source: storedConfig ? "database" : envConfig ? "environment" : "none",
    updatedAt: storedConfig ? (setting?.updatedAt ?? null) : null,
    defaultSignedUrlTtlSeconds: env.S3_SIGNED_URL_TTL_SECONDS
  });
}

async function buildUserDetail(user: typeof users.$inferSelect): Promise<AdminUserDetailResponse> {
  const totalItems = await getPublishedItemsCount();
  const [statsUser, userSubscriptions, mutes, comments, messages] = await Promise.all([
    buildStatsUser(user, totalItems),
    db.query.subscriptions.findMany({
      where: eq(subscriptions.userId, user.id),
      orderBy: [desc(subscriptions.createdAt)],
      limit: 20
    }),
    db.query.userMutes.findMany({
      where: eq(userMutes.userId, user.id),
      orderBy: [desc(userMutes.createdAt)],
      limit: 50
    }),
    db.query.lessonComments.findMany({
      where: and(eq(lessonComments.userId, user.id), ne(lessonComments.status, "visible")),
      orderBy: [desc(lessonComments.createdAt)],
      limit: 50,
      with: {
        item: true
      }
    }),
    db.query.clubChatMessages.findMany({
      where: and(eq(clubChatMessages.userId, user.id), ne(clubChatMessages.status, "visible")),
      orderBy: [desc(clubChatMessages.createdAt)],
      limit: 50,
      with: {
        topic: true
      }
    })
  ]);

  const adminActorIds = Array.from(
    new Set(
      userSubscriptions
        .map((subscription) => subscription.providerPaymentId?.match(/^admin:([^:]+):/)?.[1])
        .filter((value): value is string => Boolean(value))
    )
  );
  const uuidActorIds = adminActorIds.filter((actorId) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorId)
  );
  const telegramActorIds = adminActorIds.filter((actorId) => !uuidActorIds.includes(actorId));
  const adminActors =
    uuidActorIds.length || telegramActorIds.length
      ? await db.query.users.findMany({
          where:
            uuidActorIds.length && telegramActorIds.length
              ? or(inArray(users.id, uuidActorIds), inArray(users.telegramId, telegramActorIds))
              : uuidActorIds.length
                ? inArray(users.id, uuidActorIds)
                : inArray(users.telegramId, telegramActorIds)
        })
      : [];
  const actorById = new Map(adminActors.flatMap((actor) => [[actor.id, actor], [actor.telegramId, actor]]));
  const getActorTitle = (providerPaymentId: string | null) => {
    const actorId = providerPaymentId?.match(/^admin:([^:]+):/)?.[1];
    if (!actorId) {
      return null;
    }

    const actor = actorById.get(actorId);
    if (!actor) {
      return `ID ${actorId}`;
    }

    return actor.firstName || (actor.username ? `@${actor.username}` : `ID ${actor.telegramId}`);
  };

  const moderationEvents: AdminUserModerationEvent[] = [
    ...mutes.map((mute) => ({
      id: mute.id,
      kind: "mute" as const,
      status: mute.revokedAt ? "revoked" : mute.kind,
      body: mute.reason,
      sourceTitle: mute.expiresAt ? `До ${mute.expiresAt.toLocaleString("ru-RU")}` : "Бессрочно",
      createdAt: mute.createdAt.toISOString(),
      resolvedAt: mute.revokedAt?.toISOString() ?? null
    })),
    ...comments.map((comment) => ({
      id: comment.id,
      kind: "lesson_comment" as const,
      status: comment.status,
      body: comment.body,
      sourceTitle: comment.item.title,
      createdAt: comment.createdAt.toISOString(),
      resolvedAt: comment.moderatedAt?.toISOString() ?? null
    })),
    ...messages.map((message) => ({
      id: message.id,
      kind: "chat_message" as const,
      status: message.status,
      body: message.body,
      sourceTitle: message.topic.title,
      createdAt: message.createdAt.toISOString(),
      resolvedAt: message.moderatedAt?.toISOString() ?? null
    }))
  ].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

  return {
    user: statsUser,
    subscriptions: userSubscriptions.map((subscription) => ({
      id: subscription.id,
      status: subscription.status,
      tariff: null,
      provider: subscription.provider,
      providerPaymentId: subscription.providerPaymentId ?? null,
      changedBy: getActorTitle(subscription.providerPaymentId ?? null),
      expiresAt: subscription.expiresAt?.toISOString() ?? null,
      createdAt: subscription.createdAt.toISOString()
    })),
    moderationEvents
  };
}

async function findOrCreateUserByTelegramId(telegramId: string) {
  const [createdUser] = await db
    .insert(users)
    .values({
      telegramId,
      firstName: null,
      username: null,
      photoUrl: null
    })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: {
        updatedAt: new Date()
      }
    })
    .returning();

  return (
    createdUser ??
    (await db.query.users.findFirst({
      where: eq(users.telegramId, telegramId)
    }))
  );
}

export const adminRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", telegramAuth)
  .use("*", async (c, next) => {
    const role = await getUserRole(c.get("telegramUser").id);
    if (role === "member") {
      return c.json({ error: "Admin access required" }, 403);
    }

    await next();
  })
  .get("/admins", async (c) => {
    const ownerTelegramId = await getOwnerTelegramId();
    const admins = await db.query.adminUsers.findMany({
      where: ne(adminUsers.telegramId, ownerTelegramId),
      orderBy: (table, { desc }) => [desc(table.createdAt)]
    });
    const adminProfiles = admins.length
      ? await db.query.users.findMany({
          where: or(...admins.map((admin) => eq(users.telegramId, admin.telegramId)))
        })
      : [];
    const profilesByTelegramId = new Map(adminProfiles.map((user) => [user.telegramId, user]));

    return c.json({
      ownerTelegramId,
      admins: admins.map((admin) => {
        const profile = profilesByTelegramId.get(admin.telegramId);
        return {
          id: admin.id,
          telegramId: admin.telegramId,
          firstName: profile?.firstName ?? null,
          username: profile?.username ?? null,
          photoUrl: profile?.photoUrl ?? null,
          createdAt: admin.createdAt.toISOString()
        };
      })
    });
  })
  .get("/storage/s3", async (c) => {
    const ownerError = await rejectIfNotOwner(c);
    if (ownerError) {
      return ownerError;
    }

    const { setting, config } = await getStoredS3Setting();

    return c.json({
      settings: buildActiveS3SettingsResponse(setting, config)
    });
  })
  .post("/storage/s3", async (c) => {
    const ownerError = await rejectIfNotOwner(c);
    if (ownerError) {
      return ownerError;
    }

    const body = s3StoragePayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid S3 storage payload" }, 400);
    }

    const { setting, config: storedConfig } = await getStoredS3Setting();
    const currentConfig = storedConfig ?? getS3ConfigFromEnv(env);
    const nextConfig: StoredS3Config = {
      endpoint: body.data.endpoint,
      region: body.data.region,
      bucket: body.data.bucket,
      accessKeyId: body.data.accessKeyId || currentConfig?.accessKeyId || "",
      secretAccessKey: body.data.secretAccessKey || currentConfig?.secretAccessKey || "",
      publicBaseUrl: normalizeS3PublicBaseUrl(body.data.publicBaseUrl),
      signedUrlTtlSeconds: body.data.signedUrlTtlSeconds
    };

    if (!nextConfig.accessKeyId || !nextConfig.secretAccessKey) {
      return c.json({ error: "Access key and Secret key are required" }, 400);
    }

    try {
      await testS3Connection(nextConfig);
    } catch {
      return c.json({ error: "Unable to connect to S3 bucket" }, 400);
    }

    const now = new Date();
    const [savedSetting] = await db
      .insert(clubSettings)
      .values({
        key: storageSettingKey,
        value: JSON.stringify(nextConfig),
        updatedByUserId: c.get("userId"),
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: clubSettings.key,
        set: {
          value: JSON.stringify(nextConfig),
          updatedByUserId: c.get("userId"),
          updatedAt: now
        }
      })
      .returning();

    return c.json({
      ok: true,
      settings: buildActiveS3SettingsResponse(savedSetting ?? setting, nextConfig)
    });
  })
  .get("/stats", async (c) => {
    const totalItems = await getPublishedItemsCount();
    const [usersCountRow] = await db.select({ value: count(users.id) }).from(users);
    const recentUsers = await db.query.users.findMany({
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit: 200
    });
    const statsUsers = await Promise.all(recentUsers.map((user) => buildStatsUser(user, totalItems)));

    return c.json({
      totalUsers: usersCountRow?.value ?? statsUsers.length,
      activeUsers: statsUsers.filter((user) => user.membershipStatus === "active").length,
      completedItems: statsUsers.reduce((sum, user) => sum + user.completedItems, 0),
      totalItems,
      users: statsUsers
    });
  })
  .get("/stats/users/:telegramId", async (c) => {
    const user = await db.query.users.findFirst({
      where: eq(users.telegramId, c.req.param("telegramId"))
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(await buildStatsUser(user, await getPublishedItemsCount()));
  })
  .get("/stats/users/:telegramId/detail", async (c) => {
    const user = await db.query.users.findFirst({
      where: eq(users.telegramId, c.req.param("telegramId"))
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(await buildUserDetail(user));
  })
  .post("/access", async (c) => {
    const body = accessPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid access payload" }, 400);
    }

    const user = await findOrCreateUserByTelegramId(body.data.telegramId);
    if (!user) {
      return c.json({ error: "Unable to resolve user" }, 500);
    }
    const manageError = await rejectIfCannotManageTarget(c, user.telegramId);
    if (manageError) {
      return manageError;
    }

    const now = new Date();
    const expiresAt =
      body.data.status === "active"
        ? body.data.expiresAt
          ? new Date(body.data.expiresAt)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : body.data.expiresAt
          ? new Date(body.data.expiresAt)
          : now;

    await db.insert(subscriptions).values({
      userId: user.id,
      status: body.data.status as MembershipStatus,
      provider: "manual",
      providerPaymentId: `admin:${c.get("telegramUser").id}:${now.toISOString()}`,
      expiresAt,
      createdAt: now,
      updatedAt: now
    });

    return c.json({
      ok: true,
      user: await buildStatsUser(user, await getPublishedItemsCount())
    });
  })
  .get("/moderation", async (c) => {
    const comments = await db.query.lessonComments.findMany({
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 25,
      with: {
        user: true,
        item: true
      }
    });
    const messages = await db.query.clubChatMessages.findMany({
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 25,
      with: {
        user: true,
        topic: true
      }
    });

    const items = [
      ...comments.map((comment) => ({
        id: comment.id,
        kind: "lesson_comment" as const,
        body: comment.body,
        status: comment.status,
        author: {
          id: comment.user.id,
          telegramId: comment.user.telegramId,
          firstName: comment.user.firstName,
          username: comment.user.username,
          photoUrl: comment.user.photoUrl
        },
        sourceTitle: comment.item.title,
        createdAt: comment.createdAt.toISOString()
      })),
      ...messages.map((message) => ({
        id: message.id,
        kind: "chat_message" as const,
        body: message.body,
        status: message.status,
        author: {
          id: message.user.id,
          telegramId: message.user.telegramId,
          firstName: message.user.firstName,
          username: message.user.username,
          photoUrl: message.user.photoUrl
        },
        sourceTitle: message.topic.title,
        createdAt: message.createdAt.toISOString()
      }))
    ]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 50);

    return c.json({ items });
  })
  .get("/learning", async (c) => {
    await purgeExpiredArchivedContent();

    const rawCategories = await db
      .select({
        id: contentCategories.id,
        slug: contentCategories.slug,
        title: contentCategories.title,
        description: contentCategories.description,
        isPublished: contentCategories.isPublished,
        itemsCount: count(contentItems.id)
      })
      .from(contentCategories)
      .leftJoin(contentItems, and(eq(contentItems.categoryId, contentCategories.id), activeContentWhere()))
      .groupBy(contentCategories.id)
      .orderBy(contentCategories.sortOrder);

    const categories = rawCategories
      .filter((category) => isModuleCategoryDescription(category.description))
      .map((category) => ({
        ...category,
        description: decodeModuleCategoryDescription(category.description)
      }));
    const categoryIds = categories.map((category) => category.id);
    const materials = categoryIds.length
      ? await db.query.contentItems.findMany({
          where: and(inArray(contentItems.categoryId, categoryIds), activeContentWhere()),
          orderBy: [asc(contentItems.sortOrder), desc(contentItems.createdAt)]
        })
      : [];

    return c.json({
      categories,
      materials: await Promise.all(materials.map(serializeAdminMaterial))
    });
  })
  .post("/learning/categories", async (c) => {
    const body = learningCategoryPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid category payload" }, 400);
    }

    const [sortRow] = await db
      .select({
        value: count(contentCategories.id)
      })
      .from(contentCategories);

    const [category] = await db
      .insert(contentCategories)
      .values({
        slug: createCategorySlug(body.data.title),
        title: body.data.title,
        description: encodeModuleCategoryDescription(body.data.description),
        sortOrder: sortRow?.value ?? 0,
        isPublished: true
      })
      .returning();

    if (!category) {
      return c.json({ error: "Unable to create category" }, 500);
    }

    return c.json({
      ok: true,
      category: {
        id: category.id,
        slug: category.slug,
        title: category.title,
        description: decodeModuleCategoryDescription(category.description),
        isPublished: category.isPublished,
        itemsCount: 0
      }
    });
  })
  .post("/learning/categories/:id", async (c) => {
    const body = learningCategoryPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid category payload" }, 400);
    }

    const [category] = await db
      .update(contentCategories)
      .set({
        title: body.data.title,
        description: encodeModuleCategoryDescription(body.data.description),
        updatedAt: new Date()
      })
      .where(eq(contentCategories.id, c.req.param("id")))
      .returning();

    if (!category || !isModuleCategoryDescription(category.description)) {
      return c.json({ error: "Category not found" }, 404);
    }

    const [itemsRow] = await db
      .select({ value: count(contentItems.id) })
      .from(contentItems)
      .where(and(eq(contentItems.categoryId, category.id), activeContentWhere()));

    return c.json({
      ok: true,
      category: {
        id: category.id,
        slug: category.slug,
        title: category.title,
        description: decodeModuleCategoryDescription(category.description),
        isPublished: category.isPublished,
        itemsCount: itemsRow?.value ?? 0
      }
    });
  })
  .post("/learning/categories/:id/status", async (c) => {
    const body = categoryStatusPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid category status payload" }, 400);
    }

    const [category] = await db
      .update(contentCategories)
      .set({
        isPublished: body.data.isPublished,
        updatedAt: new Date()
      })
      .where(eq(contentCategories.id, c.req.param("id")))
      .returning();

    if (!category) {
      return c.json({ error: "Category not found" }, 404);
    }

    const [itemsRow] = await db
      .select({ value: count(contentItems.id) })
      .from(contentItems)
      .where(and(eq(contentItems.categoryId, category.id), activeContentWhere()));

    return c.json({
      ok: true,
      category: {
        id: category.id,
        slug: category.slug,
        title: category.title,
        description: decodeModuleCategoryDescription(category.description),
        isPublished: category.isPublished,
        itemsCount: itemsRow?.value ?? 0
      }
    });
  })
  .delete("/learning/categories/:id", async (c) => {
    const category = await db.query.contentCategories.findFirst({
      where: eq(contentCategories.id, c.req.param("id")),
      with: {
        items: true
      }
    });

    if (!category) {
      return c.json({ error: "Category not found" }, 404);
    }

    for (const item of category.items) {
      if (item.mediaObjectKey) {
        await deleteObject(item.mediaObjectKey).catch(() => null);
      }
      if (item.thumbnailObjectKey) {
        await deleteObject(item.thumbnailObjectKey).catch(() => null);
      }
    }

    await db.delete(contentCategories).where(eq(contentCategories.id, category.id));

    return c.json({ ok: true });
  })
  .post("/learning/materials", async (c) => {
    const form = await c.req.raw.formData().catch(() => null);
    if (!form) {
      return c.json({ error: "Invalid material payload" }, 400);
    }

    const categoryId = getFormValue(form, "categoryId");
    const kind = getFormValue(form, "kind") as ContentKind;
    const title = getFormValue(form, "title");
    const summary = normalizeOptionalText(getFormValue(form, "summary"));
    const body = normalizeOptionalText(getFormValue(form, "body"));
    const cardLayout = getFormValue(form, "cardLayout") === "horizontal" ? "horizontal" : "vertical";
    const isPublished = getFormValue(form, "isPublished") === "true";

    if (!categoryId || !contentKinds.includes(kind) || !title) {
      return c.json({ error: "Invalid material payload" }, 400);
    }

    const category = await db.query.contentCategories.findFirst({
      where: eq(contentCategories.id, categoryId)
    });
    if (!category) {
      return c.json({ error: "Category not found" }, 404);
    }

    let mediaObjectKey: string | null = null;
    let mediaContentType: string | null = null;
    let mediaSizeBytes: number | null = null;
    let thumbnailObjectKey: string | null = null;
    let thumbnailContentType: string | null = null;
    let thumbnailSizeBytes: number | null = null;
    const file = form.get("file");
    const thumbnailFile = form.get("thumbnailFile");

    if (kind !== "text") {
      if (!(file instanceof File) || file.size <= 0) {
        return c.json({ error: "Media file is required" }, 400);
      }

      const upload = await uploadMaterialFile(kind, file);
      if (!upload) {
        return c.json({ error: "Media file type does not match material kind" }, 400);
      }

      mediaObjectKey = upload.objectKey;
      mediaContentType = upload.contentType;
      mediaSizeBytes = upload.sizeBytes;
    }

    if (thumbnailFile instanceof File && thumbnailFile.size > 0) {
      const upload = await uploadThumbnailFile(thumbnailFile);
      if (!upload) {
        return c.json({ error: "Thumbnail file must be an image" }, 400);
      }

      thumbnailObjectKey = upload.objectKey;
      thumbnailContentType = upload.contentType;
      thumbnailSizeBytes = upload.sizeBytes;
    }

    const now = new Date();
    const [material] = await db
      .insert(contentItems)
      .values({
        categoryId,
        kind,
        title,
        summary,
        body,
        cardLayout,
        mediaObjectKey,
        thumbnailObjectKey,
        thumbnailContentType,
        thumbnailSizeBytes,
        mediaContentType,
        mediaSizeBytes,
        isPublished,
        publishedAt: isPublished ? now : null,
        archivedUntil: null,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    if (!material) {
      return c.json({ error: "Unable to create material" }, 500);
    }

    return c.json({
      ok: true,
      material: await serializeAdminMaterial(material)
    });
  })
  .post("/learning/materials/:id", async (c) => {
    const current = await db.query.contentItems.findFirst({
      where: eq(contentItems.id, c.req.param("id"))
    });
    if (!current) {
      return c.json({ error: "Material not found" }, 404);
    }

    const form = await c.req.raw.formData().catch(() => null);
    if (!form) {
      return c.json({ error: "Invalid material payload" }, 400);
    }

    const categoryId = getFormValue(form, "categoryId");
    const kind = getFormValue(form, "kind") as ContentKind;
    const title = getFormValue(form, "title");
    const summary = normalizeOptionalText(getFormValue(form, "summary"));
    const body = normalizeOptionalText(getFormValue(form, "body"));
    const cardLayout = getFormValue(form, "cardLayout") === "horizontal" ? "horizontal" : "vertical";
    const isPublished = getFormValue(form, "isPublished") === "true";

    if (!categoryId || !contentKinds.includes(kind) || !title) {
      return c.json({ error: "Invalid material payload" }, 400);
    }

    const category = await db.query.contentCategories.findFirst({
      where: eq(contentCategories.id, categoryId)
    });
    if (!category) {
      return c.json({ error: "Category not found" }, 404);
    }

    const file = form.get("file");
    const thumbnailFile = form.get("thumbnailFile");
    let mediaObjectKey = current.mediaObjectKey;
    let mediaUrl = current.mediaUrl;
    let mediaContentType = current.mediaContentType;
    let mediaSizeBytes = current.mediaSizeBytes;
    let thumbnailObjectKey = current.thumbnailObjectKey;
    let thumbnailUrl = current.thumbnailUrl;
    let thumbnailContentType = current.thumbnailContentType;
    let thumbnailSizeBytes = current.thumbnailSizeBytes;

    if (kind === "text") {
      if (current.mediaObjectKey) {
        await deleteObject(current.mediaObjectKey).catch(() => null);
      }
      mediaObjectKey = null;
      mediaUrl = null;
      mediaContentType = null;
      mediaSizeBytes = null;
    } else if (file instanceof File && file.size > 0) {
      const upload = await uploadMaterialFile(kind, file);
      if (!upload) {
        return c.json({ error: "Media file type does not match material kind" }, 400);
      }
      if (current.mediaObjectKey) {
        await deleteObject(current.mediaObjectKey).catch(() => null);
      }
      mediaObjectKey = upload.objectKey;
      mediaUrl = null;
      mediaContentType = upload.contentType;
      mediaSizeBytes = upload.sizeBytes;
    } else if (current.kind !== kind || !current.mediaObjectKey) {
      return c.json({ error: "Media file is required when changing material kind" }, 400);
    }

    if (thumbnailFile instanceof File && thumbnailFile.size > 0) {
      const upload = await uploadThumbnailFile(thumbnailFile);
      if (!upload) {
        return c.json({ error: "Thumbnail file must be an image" }, 400);
      }
      if (current.thumbnailObjectKey) {
        await deleteObject(current.thumbnailObjectKey).catch(() => null);
      }
      thumbnailObjectKey = upload.objectKey;
      thumbnailUrl = null;
      thumbnailContentType = upload.contentType;
      thumbnailSizeBytes = upload.sizeBytes;
    }

    const now = new Date();
    const [material] = await db
      .update(contentItems)
      .set({
        categoryId,
        kind,
        title,
        summary,
        body,
        cardLayout,
        mediaUrl,
        mediaObjectKey,
        mediaContentType,
        mediaSizeBytes,
        thumbnailUrl,
        thumbnailObjectKey,
        thumbnailContentType,
        thumbnailSizeBytes,
        isPublished,
        publishedAt: isPublished ? (current.publishedAt ?? now) : null,
        archivedUntil: null,
        updatedAt: now
      })
      .where(eq(contentItems.id, current.id))
      .returning();

    if (!material) {
      return c.json({ error: "Unable to update material" }, 500);
    }

    return c.json({
      ok: true,
      material: await serializeAdminMaterial(material)
    });
  })
  .post("/learning/materials/:id/status", async (c) => {
    const body = materialStatusPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid material status payload" }, 400);
    }

    const current = await db.query.contentItems.findFirst({
      where: eq(contentItems.id, c.req.param("id"))
    });
    if (!current) {
      return c.json({ error: "Material not found" }, 404);
    }

    const now = new Date();
    const [material] = await db
      .update(contentItems)
      .set({
        isPublished: body.data.isPublished,
        publishedAt: body.data.isPublished ? (current.publishedAt ?? now) : null,
        archivedUntil: null,
        updatedAt: now
      })
      .where(eq(contentItems.id, current.id))
      .returning();

    if (!material) {
      return c.json({ error: "Unable to update material" }, 500);
    }

    return c.json({
      ok: true,
      material: await serializeAdminMaterial(material)
    });
  })
  .post("/learning/materials/:id/restore", async (c) => {
    const current = await db.query.contentItems.findFirst({
      where: eq(contentItems.id, c.req.param("id"))
    });
    if (!current) {
      return c.json({ error: "Material not found" }, 404);
    }

    if (current.archivedUntil && current.archivedUntil <= new Date()) {
      return c.json({ error: "Material archive expired" }, 410);
    }

    const [material] = await db
      .update(contentItems)
      .set(getRestoredContentArchiveValues({ publishedAt: current.publishedAt, now: new Date() }))
      .where(eq(contentItems.id, current.id))
      .returning();

    if (!material) {
      return c.json({ error: "Unable to restore material" }, 500);
    }

    return c.json({
      ok: true,
      material: await serializeAdminMaterial(material)
    });
  })
  .delete("/learning/materials/:id", async (c) => {
    const material = await db.query.contentItems.findFirst({
      where: eq(contentItems.id, c.req.param("id"))
    });
    if (!material) {
      return c.json({ error: "Material not found" }, 404);
    }

    await db
      .update(contentItems)
      .set({
        isPublished: false,
        publishedAt: null,
        archivedUntil: new Date(Date.now() + contentArchiveTtlMs),
        updatedAt: new Date()
      })
      .where(eq(contentItems.id, material.id));

    return c.json({ ok: true });
  })
  .post("/moderation/:kind/:id/status", async (c) => {
    const body = moderationStatusPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid moderation payload" }, 400);
    }

    const kind = c.req.param("kind");
    const id = c.req.param("id");
    const values = {
      status: body.data.status,
      moderatedByUserId: c.get("userId"),
      moderatedAt: new Date(),
      moderationReason: body.data.reason ?? null,
      updatedAt: new Date()
    };

    if (kind === "lesson_comment") {
      const comment = await db.query.lessonComments.findFirst({
        where: eq(lessonComments.id, id),
        with: { user: true }
      });
      if (!comment) {
        return c.json({ error: "Moderation item not found" }, 404);
      }
      const manageError = await rejectIfCannotManageTarget(c, comment.user.telegramId);
      if (manageError) {
        return manageError;
      }

      await db.update(lessonComments).set(values).where(eq(lessonComments.id, id));
      return c.json({ ok: true });
    }

    if (kind === "chat_message") {
      const message = await db.query.clubChatMessages.findFirst({
        where: eq(clubChatMessages.id, id),
        with: { user: true }
      });
      if (!message) {
        return c.json({ error: "Moderation item not found" }, 404);
      }
      const manageError = await rejectIfCannotManageTarget(c, message.user.telegramId);
      if (manageError) {
        return manageError;
      }

      const role = await getUserRole(c.get("telegramUser").id);
      if (body.data.status === "deleted" && shouldHardDeleteMessages(role)) {
        await db.delete(clubChatMessages).where(eq(clubChatMessages.id, id));
        return c.json({ ok: true });
      }

      await db
        .update(clubChatMessages)
        .set({
          ...values,
          purgeAt:
            body.data.status === "deleted"
              ? getMessagePurgeAt("message", role, values.moderatedAt)
              : null
        })
        .where(eq(clubChatMessages.id, id));
      return c.json({ ok: true });
    }

    return c.json({ error: "Unknown moderation item" }, 404);
  })
  .get("/mutes", async (c) => {
    const mutes = await db.query.userMutes.findMany({
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 100,
      with: {
        user: true
      }
    });

    return c.json({
      mutes: mutes.map((mute) => ({
        id: mute.id,
        userId: mute.userId,
        telegramId: mute.user.telegramId,
        firstName: mute.user.firstName,
        username: mute.user.username,
        photoUrl: mute.user.photoUrl,
        kind: mute.kind,
        reason: mute.reason,
        expiresAt: mute.expiresAt?.toISOString() ?? null,
        revokedAt: mute.revokedAt?.toISOString() ?? null,
        createdAt: mute.createdAt.toISOString()
      }))
    });
  })
  .post("/mutes", async (c) => {
    const body = mutePayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid mute payload" }, 400);
    }

    if (await isOwnerTelegramId(body.data.telegramId)) {
      return c.json({ error: "Owner cannot be muted" }, 400);
    }

    const user = await findOrCreateUserByTelegramId(body.data.telegramId);
    if (!user) {
      return c.json({ error: "Unable to resolve user" }, 500);
    }
    const manageError = await rejectIfCannotManageTarget(c, user.telegramId);
    if (manageError) {
      return manageError;
    }
    const activeMute = await getActiveMute(user.id);
    if (activeMute) {
      return c.json({ error: "Active mute already exists" }, 409);
    }

    const expiresAt =
      body.data.kind === "temporary"
        ? body.data.expiresAt
          ? new Date(body.data.expiresAt)
          : new Date(Date.now() + 24 * 60 * 60 * 1000)
        : null;

    const [mute] = await db
      .insert(userMutes)
      .values({
        userId: user.id,
        kind: body.data.kind,
        reason: body.data.reason ?? null,
        expiresAt,
        createdByUserId: c.get("userId")
      })
      .returning();

    if (!mute) {
      return c.json({ error: "Unable to create mute" }, 500);
    }

    return c.json({
      ok: true,
      mute: {
        id: mute.id,
        userId: mute.userId,
        telegramId: user.telegramId,
        kind: mute.kind,
        reason: mute.reason,
        expiresAt: mute.expiresAt?.toISOString() ?? null,
        revokedAt: mute.revokedAt?.toISOString() ?? null,
        createdAt: mute.createdAt.toISOString()
      }
    });
  })
  .delete("/mutes/:id", async (c) => {
    const mute = await db.query.userMutes.findFirst({
      where: eq(userMutes.id, c.req.param("id")),
      with: { user: true }
    });
    if (!mute) {
      return c.json({ error: "Mute not found" }, 404);
    }
    const manageError = await rejectIfCannotManageTarget(c, mute.user.telegramId);
    if (manageError) {
      return manageError;
    }

    await db
      .update(userMutes)
      .set({
        revokedAt: new Date(),
        revokedByUserId: c.get("userId"),
        updatedAt: new Date()
      })
      .where(eq(userMutes.id, c.req.param("id")));

    return c.json({ ok: true });
  })
  .post("/admins", async (c) => {
    if (!(await isOwnerTelegramId(c.get("telegramUser").id))) {
      return c.json({ error: "Owner access required" }, 403);
    }

    const body = adminPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Telegram ID must contain only digits" }, 400);
    }

    if (await isOwnerTelegramId(body.data.telegramId)) {
      return c.json({ ok: true });
    }

    await db
      .insert(adminUsers)
      .values({
        telegramId: body.data.telegramId,
        createdByUserId: c.get("userId")
      })
      .onConflictDoNothing({
        target: adminUsers.telegramId
      });

    return c.json({ ok: true });
  })
  .post("/owner/transfer", async (c) => {
    const currentOwnerTelegramId = await getOwnerTelegramId();
    if (c.get("telegramUser").id !== currentOwnerTelegramId) {
      return c.json({ error: "Owner access required" }, 403);
    }

    const body = ownerTransferPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Telegram ID must contain only digits" }, 400);
    }

    const targetAdmin = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.telegramId, body.data.telegramId)
    });
    if (!targetAdmin) {
      return c.json({ error: "Передать клуб можно только администратору из списка." }, 400);
    }

    const targetRole = await getUserRole(body.data.telegramId);
    const validation = validateOwnerTransferTarget({
      currentOwnerTelegramId,
      targetTelegramId: body.data.telegramId,
      targetRole
    });
    if (!validation.ok) {
      return c.json({ error: validation.error }, validation.status);
    }

    const now = new Date();
    await db
      .insert(adminUsers)
      .values({
        telegramId: currentOwnerTelegramId,
        createdByUserId: c.get("userId")
      })
      .onConflictDoNothing({
        target: adminUsers.telegramId
      });

    await db
      .insert(clubSettings)
      .values({
        key: ownerTelegramIdSettingKey,
        value: body.data.telegramId,
        updatedByUserId: c.get("userId"),
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: clubSettings.key,
        set: {
          value: body.data.telegramId,
          updatedByUserId: c.get("userId"),
          updatedAt: now
        }
      });

    await db.delete(adminUsers).where(eq(adminUsers.telegramId, body.data.telegramId));

    return c.json({ ok: true });
  })
  .delete("/admins/:telegramId", async (c) => {
    if (!(await isOwnerTelegramId(c.get("telegramUser").id))) {
      return c.json({ error: "Owner access required" }, 403);
    }

    const telegramId = c.req.param("telegramId");
    if (await isOwnerTelegramId(telegramId)) {
      return c.json({ error: "Owner cannot be removed" }, 400);
    }

    await db.delete(adminUsers).where(eq(adminUsers.telegramId, telegramId));

    return c.json({ ok: true });
  });
