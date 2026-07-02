import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { randomUUID } from "node:crypto";
import { statfs } from "node:fs/promises";
import { cpus, freemem, loadavg, totalmem, uptime as systemUptime } from "node:os";
import { z } from "zod";
import {
  adminPermissionSchema,
  allAdminPermissions,
  deviceDiagnosticsSchema,
  newAdminDefaultPermissions,
  type AdminActionActor,
  adminLearningDirectUploadRequestSchema,
  adminLearningMultipartCompleteRequestSchema,
  adminLearningUploadedObjectSchema,
  normalizeExternalMediaUrl,
  type AdminLearningMaterial,
  type AdminPermission,
  type AdminUserDetailResponse,
  type AdminUserModerationEvent,
  type AdminStatsUser,
  type ContentKind,
  type MediaSource,
  type MembershipStatus
} from "@club/shared";
import { getOwnerTelegramId, getUserRole, hasAdminPermission, isOwnerTelegramId, normalizeAdminPermissions, ownerTelegramIdSettingKey } from "../admin/roles";
import { validateOwnerTransferTarget } from "../admin/ownerTransfer";
import { recordAdminAction } from "../admin/actionLog";
import { db } from "../db/client";
import {
  adminActionLogs,
  adminMailings,
  adminUsers,
  appNotifications,
  clubSettings,
  clubChatMessages,
  contentCategories,
  contentItems,
  lessonMaterials,
  lessonComments,
  subscriptions,
  supportTicketAttachments,
  userContentProgress,
  userMutes,
  users
} from "../db/schema";
import { env } from "../env";
import { logger } from "../logger";
import { countServerErrors, listServerErrors, recordServerError } from "../serverErrors";
import { getMembership } from "../membership/getMembership";
import { getActiveMute } from "../moderation/mutes";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  createObjectUploadUrl,
  deleteObject,
  getObjectMetadata,
  getObjectReadUrl,
  listObjects,
  mirrorObjectToReserve,
  testS3Connection,
  uploadObject
} from "../storage/s3";
import { classifyS3ObjectKey } from "../storage/s3Object";
import { optimizeImageForUpload } from "../storage/imageOptimizer";
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
import { createAppNotification } from "../notifications/create";
import {
  decodeModuleCategoryDefaultCardLayout,
  decodeModuleCategoryDescription,
  encodeModuleCategoryDescription,
  isModuleCategoryDescription
} from "../learning/moduleCategory";

const adminPayloadSchema = z.object({
  telegramId: z.string().trim().regex(/^\d{3,32}$/)
});

const adminUpdatePayloadSchema = z.object({
  roleLabel: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  isActive: z.boolean().optional(),
  permissions: z.array(adminPermissionSchema).optional()
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
  description: z.string().trim().max(1000).nullable().optional(),
  defaultCardLayout: z.enum(["vertical", "horizontal"]).default("vertical")
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
  reserveEndpoint: z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.string().trim().url().optional()),
  reserveRegion: z.string().trim().optional(),
  reserveBucket: z.string().trim().optional(),
  reserveAccessKeyId: z.string().trim().optional(),
  reserveSecretAccessKey: z.string().trim().optional(),
  reservePublicBaseUrl: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().url().nullable().optional()
  ),
  signedUrlTtlSeconds: z.coerce.number().int().positive().max(86_400).default(3600)
});

const s3ObjectPayloadSchema = z.object({
  key: z.string().trim().min(1),
  target: z.enum(["primary", "reserve"]).optional()
});
const s3StorageTargetSchema = z.enum(["primary", "reserve"]);

const contentKinds = ["text", "photo", "video", "audio"] as const;
const contentArchiveTtlMs = 7 * 24 * 60 * 60 * 1000;
const directLearningMediaUploadMaxBytes = 2 * 1024 * 1024 * 1024;
const directLearningThumbnailUploadMaxBytes = 20 * 1024 * 1024;

const externalMediaUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => Boolean(normalizeExternalMediaUrl(value)))
  .transform((value) => normalizeExternalMediaUrl(value)!);

const directLearningMaterialPayloadSchema = z.object({
  categoryId: z.string().trim().min(1),
  kind: z.enum(contentKinds),
  title: z.string().trim().min(1),
  summary: z.string().trim().optional().default(""),
  body: z.string().trim().optional().default(""),
  materials: z
    .array(
      z.object({
        id: z.string().trim().optional(),
        kind: z.enum(contentKinds),
        title: z.string().trim().min(1).max(160),
        description: z.string().trim().optional().default(""),
        body: z.string().trim().optional().default(""),
        mediaUrl: externalMediaUrlSchema.nullable().optional(),
        mediaObject: adminLearningUploadedObjectSchema.nullable().optional()
      })
    )
    .max(50)
    .optional()
    .default([]),
  cardLayout: z.enum(["vertical", "horizontal"]).default("vertical"),
  isPublished: z.boolean().default(true),
  mediaUrl: externalMediaUrlSchema.nullable().optional(),
  mediaObject: adminLearningUploadedObjectSchema.nullable().optional(),
  thumbnailObject: adminLearningUploadedObjectSchema.nullable().optional(),
  removeThumbnail: z.boolean().optional().default(false)
});

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

  const originalBytes = new Uint8Array(await file.arrayBuffer());
  const optimized = kind === "photo"
    ? await optimizeImageForUpload({ bytes: originalBytes, contentType, fileName: file.name })
    : {
        body: originalBytes,
        contentType,
        fileName: file.name,
        sizeBytes: file.size
      };
  const key = buildLearningMediaObjectKey({
    kind,
    fileName: optimized.fileName,
    id: randomUUID(),
    now: new Date()
  });
  const upload = await uploadObject({
    key,
    body: optimized.body,
    contentType: optimized.contentType
  });

  return {
    objectKey: upload.key,
    contentType: optimized.contentType,
    sizeBytes: optimized.sizeBytes
  };
}

async function uploadThumbnailFile(file: File) {
  const contentType = file.type || "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    return null;
  }

  const optimized = await optimizeImageForUpload({
    bytes: new Uint8Array(await file.arrayBuffer()),
    contentType,
    fileName: file.name,
    maxDimension: 1200
  });
  const key = buildLearningThumbnailObjectKey({
    fileName: optimized.fileName,
    id: randomUUID(),
    now: new Date()
  });
  const upload = await uploadObject({
    key,
    body: optimized.body,
    contentType: optimized.contentType
  });

  return {
    objectKey: upload.key,
    contentType: optimized.contentType,
    sizeBytes: optimized.sizeBytes
  };
}

function rejectInvalidDirectUploadSize(purpose: "media" | "thumbnail", sizeBytes: number) {
  const maxBytes = purpose === "media" ? directLearningMediaUploadMaxBytes : directLearningThumbnailUploadMaxBytes;
  return sizeBytes <= 0 || sizeBytes > maxBytes;
}

async function verifyDirectUploadedObject({
  object,
  purpose,
  kind
}: {
  object: z.infer<typeof adminLearningUploadedObjectSchema>;
  purpose: "media" | "thumbnail";
  kind?: ContentKind;
}) {
  if (purpose === "media") {
    if (!kind || !getLearningMediaUploadContentType(kind, object.contentType, object.objectKey)) {
      return null;
    }
    if (!object.objectKey.startsWith(`learning/${kind}/`)) {
      return null;
    }
  } else {
    if (!object.contentType.startsWith("image/") || !object.objectKey.startsWith("learning/thumbnails/")) {
      return null;
    }
  }

  if (rejectInvalidDirectUploadSize(purpose, object.sizeBytes)) {
    return null;
  }

  const metadata = await getObjectMetadata(object.objectKey);
  if (metadata.sizeBytes !== object.sizeBytes) {
    return null;
  }
  if (metadata.contentType && metadata.contentType !== object.contentType) {
    return null;
  }

  return {
    objectKey: metadata.key,
    contentType: object.contentType,
    sizeBytes: object.sizeBytes
  };
}

function mirrorDirectUploadToReserve(object: { objectKey: string; contentType: string } | null) {
  if (!object) {
    return;
  }

  void mirrorObjectToReserve(object.objectKey, object.contentType).catch((error) => {
    logger.warn({ error, key: object.objectKey }, "Failed to mirror direct upload to reserve S3");
  });
}

function getSerializedMediaSource(mediaObjectKey: string | null, mediaUrl: string | null): MediaSource | null {
  if (mediaObjectKey) {
    return "s3";
  }

  return mediaUrl ? "external" : null;
}

async function serializeLessonMaterial(material: typeof lessonMaterials.$inferSelect) {
  const mediaUrl = material.mediaObjectKey ? await getObjectReadUrl(material.mediaObjectKey) : material.mediaUrl;

  return {
    id: material.id,
    kind: material.kind,
    title: material.title,
    description: material.description,
    body: material.body,
    mediaUrl,
    mediaSource: getSerializedMediaSource(material.mediaObjectKey, material.mediaUrl),
    mediaContentType: material.mediaContentType,
    mediaSizeBytes: material.mediaSizeBytes
  };
}

async function getSerializedLessonMaterials(contentItemId: string) {
  const materials = await db.query.lessonMaterials.findMany({
    where: eq(lessonMaterials.contentItemId, contentItemId),
    orderBy: [asc(lessonMaterials.sortOrder), asc(lessonMaterials.createdAt)]
  });

  return Promise.all(materials.map(serializeLessonMaterial));
}

async function deleteLessonMaterialObjects(contentItemId: string) {
  const materials = await db.query.lessonMaterials.findMany({
    where: eq(lessonMaterials.contentItemId, contentItemId)
  });

  for (const material of materials) {
    if (material.mediaObjectKey) {
      await deleteObject(material.mediaObjectKey).catch(() => null);
    }
  }
}

async function replaceDirectLessonMaterials(
  contentItemId: string,
  materials: z.infer<typeof directLearningMaterialPayloadSchema>["materials"]
) {
  const existingMaterials = await db.query.lessonMaterials.findMany({
    where: eq(lessonMaterials.contentItemId, contentItemId)
  });
  const existingById = new Map(existingMaterials.map((material) => [material.id, material]));

  const verifiedMaterials: Array<{
    kind: ContentKind;
    title: string;
    description: string | null;
    body: string | null;
    mediaUrl: string | null;
    mediaObjectKey: string | null;
    mediaContentType: string | null;
    mediaSizeBytes: number | null;
    verifiedMedia: Awaited<ReturnType<typeof verifyDirectUploadedObject>> | null;
  }> = [];

  for (const material of materials) {
    let verifiedMedia: Awaited<ReturnType<typeof verifyDirectUploadedObject>> | null = null;
    const mediaUrl = material.mediaUrl ?? null;

    if (material.kind === "text") {
      verifiedMaterials.push({
        kind: material.kind,
        title: material.title,
        description: normalizeOptionalText(material.description),
        body: normalizeOptionalText(material.body),
        mediaUrl: null,
        mediaObjectKey: null,
        mediaContentType: null,
        mediaSizeBytes: null,
        verifiedMedia: null
      });
      continue;
    }

    if (mediaUrl) {
      verifiedMaterials.push({
        kind: material.kind,
        title: material.title,
        description: normalizeOptionalText(material.description),
        body: normalizeOptionalText(material.body),
        mediaUrl,
        mediaObjectKey: null,
        mediaContentType: null,
        mediaSizeBytes: null,
        verifiedMedia: null
      });
      continue;
    }

    if (material.mediaObject) {
      verifiedMedia = await verifyDirectUploadedObject({ object: material.mediaObject, purpose: "media", kind: material.kind });
      if (!verifiedMedia) {
        throw new Error("Lesson material media type does not match kind");
      }
    } else {
      const existing = material.id ? existingById.get(material.id) : null;
      if (!existing || existing.kind !== material.kind || (!existing.mediaObjectKey && !existing.mediaUrl)) {
        throw new Error("Media file is required for lesson material");
      }

      verifiedMaterials.push({
        kind: material.kind,
        title: material.title,
        description: normalizeOptionalText(material.description),
        body: normalizeOptionalText(material.body),
        mediaUrl: existing.mediaUrl,
        mediaObjectKey: existing.mediaObjectKey,
        mediaContentType: existing.mediaContentType,
        mediaSizeBytes: existing.mediaSizeBytes,
        verifiedMedia: null
      });
      continue;
    }

    verifiedMaterials.push({
      kind: material.kind,
      title: material.title,
      description: normalizeOptionalText(material.description),
      body: normalizeOptionalText(material.body),
      mediaUrl: null,
      mediaObjectKey: verifiedMedia?.objectKey ?? null,
      mediaContentType: verifiedMedia?.contentType ?? null,
      mediaSizeBytes: verifiedMedia?.sizeBytes ?? null,
      verifiedMedia
    });
  }

  const nextObjectKeys = new Set(verifiedMaterials.map((material) => material.mediaObjectKey).filter(Boolean));
  for (const existing of existingMaterials) {
    if (existing.mediaObjectKey && !nextObjectKeys.has(existing.mediaObjectKey)) {
      await deleteObject(existing.mediaObjectKey).catch(() => null);
    }
  }

  await db.delete(lessonMaterials).where(eq(lessonMaterials.contentItemId, contentItemId));

  if (verifiedMaterials.length) {
    const now = new Date();
    await db.insert(lessonMaterials).values(
      verifiedMaterials.map((material, index) => ({
        contentItemId,
        kind: material.kind,
        title: material.title,
        description: material.description,
        body: material.body,
        mediaUrl: material.mediaUrl,
        mediaObjectKey: material.mediaObjectKey,
        mediaContentType: material.mediaContentType,
        mediaSizeBytes: material.mediaSizeBytes,
        sortOrder: index,
        createdAt: now,
        updatedAt: now
      }))
    );
  }

  for (const material of verifiedMaterials) {
    mirrorDirectUploadToReserve(material.verifiedMedia);
  }
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
    mediaSource: getSerializedMediaSource(item.mediaObjectKey, item.mediaUrl),
    thumbnailUrl,
    cardLayout: item.cardLayout === "horizontal" ? "horizontal" : "vertical",
    mediaContentType: item.mediaContentType,
    mediaSizeBytes: item.mediaSizeBytes,
    materials: await getSerializedLessonMaterials(item.id),
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
    await deleteLessonMaterialObjects(item.id);
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
    lastLoginAt: user.updatedAt.toISOString(),
    telegramBotStatus: user.telegramBotStatus as AdminStatsUser["telegramBotStatus"],
    telegramBotBlockedAt: user.telegramBotBlockedAt?.toISOString() ?? null,
    telegramBotUnblockedAt: user.telegramBotUnblockedAt?.toISOString() ?? null,
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

async function rejectIfNotOwner(c: Context<{ Variables: AuthVariables }>, permission?: AdminPermission) {
  const telegramId = c.get("telegramUser").id;
  if (await isOwnerTelegramId(telegramId)) {
    return null;
  }

  if (permission && (await hasAdminPermission(telegramId, permission))) {
    return null;
  }

  return c.json({ error: "Owner access required" }, 403);
}

async function rejectIfMissingAnyPermission(c: Context<{ Variables: AuthVariables }>, permissions: AdminPermission[]) {
  const telegramId = c.get("telegramUser").id;
  if (await isOwnerTelegramId(telegramId)) {
    return null;
  }

  for (const permission of permissions) {
    if (await hasAdminPermission(telegramId, permission)) {
      return null;
    }
  }

  return c.json({ error: "Admin permission required" }, 403);
}

function requireAdminPermission(permission: AdminPermission) {
  return async (c: Context<{ Variables: AuthVariables }>, next: () => Promise<void>) => {
    const errorResponse = await rejectIfNotOwner(c, permission);
    if (errorResponse) {
      return errorResponse;
    }

    await next();
  };
}

function requireAnyAdminPermission(permissions: AdminPermission[]) {
  return async (c: Context<{ Variables: AuthVariables }>, next: () => Promise<void>) => {
    const errorResponse = await rejectIfMissingAnyPermission(c, permissions);
    if (errorResponse) {
      return errorResponse;
    }

    await next();
  };
}

function buildUsage(usedBytes: number, totalBytes: number, freeBytes: number) {
  const normalizedTotal = Math.max(0, Math.round(totalBytes));
  const normalizedUsed = Math.max(0, Math.round(usedBytes));
  const normalizedFree = Math.max(0, Math.round(freeBytes));

  return {
    usedBytes: normalizedUsed,
    totalBytes: normalizedTotal,
    freeBytes: normalizedFree,
    usedPercent: normalizedTotal > 0 ? Math.min(100, Math.round((normalizedUsed / normalizedTotal) * 1000) / 10) : 0
  };
}

async function getDiskUsage() {
  try {
    const diskPath = process.platform === "win32" ? process.cwd() : "/";
    const stats = await statfs(diskPath);
    const blockSize = Number(stats.bsize);
    const totalBytes = Number(stats.blocks) * blockSize;
    const freeBytes = Number(stats.bavail) * blockSize;
    return buildUsage(totalBytes - freeBytes, totalBytes, freeBytes);
  } catch (error) {
    logger.warn({ error }, "Unable to read server disk usage");
    return null;
  }
}

async function buildAdminServerStatus() {
  const processMemory = process.memoryUsage();
  const memoryTotal = totalmem();
  const memoryFree = freemem();

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    processUptimeSeconds: Math.floor(process.uptime()),
    systemUptimeSeconds: Math.floor(systemUptime()),
    cpuCount: cpus().length,
    loadAverage: loadavg().map((value) => Math.round(value * 100) / 100),
    processMemory: {
      rssBytes: processMemory.rss,
      heapUsedBytes: processMemory.heapUsed,
      heapTotalBytes: processMemory.heapTotal
    },
    systemMemory: buildUsage(memoryTotal - memoryFree, memoryTotal, memoryFree),
    disk: await getDiskUsage(),
    serverErrorCount: countServerErrors()
  };
}

function serializeAdmin(admin: typeof adminUsers.$inferSelect, profile: typeof users.$inferSelect | undefined) {
  return {
    id: admin.id,
    telegramId: admin.telegramId,
    firstName: profile?.firstName ?? null,
    username: profile?.username ?? null,
    photoUrl: profile?.photoUrl ?? null,
    roleLabel: admin.roleLabel,
    isActive: admin.isActive,
    permissions: normalizeAdminPermissions(admin.permissions),
    createdAt: admin.createdAt.toISOString()
  };
}

function serializeAdminActionActor(telegramId: string, profile?: typeof users.$inferSelect): AdminActionActor {
  return {
    telegramId,
    firstName: profile?.firstName ?? null,
    username: profile?.username ?? null,
    photoUrl: profile?.photoUrl ?? null
  };
}

function serializeStorageUploader(profile?: typeof users.$inferSelect | null): AdminActionActor | null {
  if (!profile) {
    return null;
  }

  return serializeAdminActionActor(profile.telegramId, profile);
}

async function buildS3ObjectMetadata(keys: string[]) {
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  const metadataByKey = new Map<string, { entityTitle: string | null; uploadedBy: AdminActionActor | null }>();
  if (!uniqueKeys.length) {
    return metadataByKey;
  }

  const [materials, supportAttachments, notifications, mailings] = await Promise.all([
    db.query.contentItems.findMany({
      where: or(inArray(contentItems.mediaObjectKey, uniqueKeys), inArray(contentItems.thumbnailObjectKey, uniqueKeys))
    }),
    db.query.supportTicketAttachments.findMany({
      where: inArray(supportTicketAttachments.objectKey, uniqueKeys),
      with: {
        ticket: true,
        message: {
          with: {
            author: true
          }
        }
      }
    }),
    db.query.appNotifications.findMany({
      where: inArray(appNotifications.attachmentObjectKey, uniqueKeys),
      with: {
        user: true
      }
    }),
    db.query.adminMailings.findMany({
      where: inArray(adminMailings.attachmentObjectKey, uniqueKeys),
      with: {
        createdBy: true
      }
    })
  ]);

  for (const material of materials) {
    if (material.mediaObjectKey) {
      metadataByKey.set(material.mediaObjectKey, {
        entityTitle: material.title,
        uploadedBy: null
      });
    }
    if (material.thumbnailObjectKey) {
      metadataByKey.set(material.thumbnailObjectKey, {
        entityTitle: material.title,
        uploadedBy: null
      });
    }
  }

  for (const attachment of supportAttachments) {
    metadataByKey.set(attachment.objectKey, {
      entityTitle: attachment.ticket?.customTopic ?? attachment.ticket?.topic ?? attachment.fileName,
      uploadedBy: serializeStorageUploader(attachment.message?.author)
    });
  }

  for (const notification of notifications) {
    if (!notification.attachmentObjectKey) {
      continue;
    }
    metadataByKey.set(notification.attachmentObjectKey, {
      entityTitle: notification.title,
      uploadedBy: serializeStorageUploader(notification.user)
    });
  }

  for (const mailing of mailings) {
    if (!mailing.attachmentObjectKey) {
      continue;
    }
    metadataByKey.set(mailing.attachmentObjectKey, {
      entityTitle: mailing.title,
      uploadedBy: serializeStorageUploader(mailing.createdBy)
    });
  }

  return metadataByKey;
}

function serializeAdminActionLog(
  log: typeof adminActionLogs.$inferSelect & { actor?: typeof users.$inferSelect | null; targetUser?: typeof users.$inferSelect | null }
) {
  return {
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    targetTelegramId: log.targetTelegramId,
    summary: log.summary,
    metadata: log.metadata,
    actor: serializeAdminActionActor(log.actorTelegramId, log.actor ?? undefined),
    target: log.targetTelegramId ? serializeAdminActionActor(log.targetTelegramId, log.targetUser ?? undefined) : null,
    createdAt: log.createdAt.toISOString()
  };
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

  const device = user.deviceSnapshot ? deviceDiagnosticsSchema.safeParse(user.deviceSnapshot) : null;

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
    moderationEvents,
    device: device?.success ? device.data : null
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
  .use("/admins", requireAdminPermission("admins"))
  .use("/admins/*", requireAdminPermission("admins"))
  .use("/action-logs", requireAdminPermission("admins"))
  .use("/stats", requireAnyAdminPermission(["statistics", "users"]))
  .use("/stats/*", requireAnyAdminPermission(["statistics", "users"]))
  .use("/access", requireAdminPermission("accesses"))
  .use("/learning", requireAdminPermission("materials"))
  .use("/learning/*", requireAdminPermission("materials"))
  .use("/moderation", requireAnyAdminPermission(["materials", "community"]))
  .use("/moderation/*", requireAnyAdminPermission(["materials", "community"]))
  .use("/mutes", requireAdminPermission("users"))
  .use("/mutes/*", requireAdminPermission("users"))
  .use("/storage/s3", requireAdminPermission("storage"))
  .use("/storage/s3/*", requireAdminPermission("storage"))
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
      admins: admins.map((admin) => serializeAdmin(admin, profilesByTelegramId.get(admin.telegramId)))
    });
  })
  .get("/action-logs", async (c) => {
    const actorTelegramId = c.req.query("actorTelegramId")?.trim();
    const ownerTelegramId = await getOwnerTelegramId();
    const admins = await db.query.adminUsers.findMany({
      orderBy: (table, { desc }) => [desc(table.createdAt)]
    });
    const logs = await db.query.adminActionLogs.findMany({
      where: actorTelegramId ? eq(adminActionLogs.actorTelegramId, actorTelegramId) : undefined,
      orderBy: [desc(adminActionLogs.createdAt)],
      limit: 100,
      with: {
        actor: true,
        targetUser: true
      }
    });
    const adminTelegramIds = Array.from(
      new Set([ownerTelegramId, ...admins.map((admin) => admin.telegramId), ...logs.map((log) => log.actorTelegramId)])
    );
    const profiles = adminTelegramIds.length
      ? await db.query.users.findMany({
          where: inArray(users.telegramId, adminTelegramIds)
        })
      : [];
    const profilesByTelegramId = new Map(profiles.map((user) => [user.telegramId, user]));

    return c.json({
      admins: adminTelegramIds.map((telegramId) => serializeAdminActionActor(telegramId, profilesByTelegramId.get(telegramId))),
      logs: logs.map(serializeAdminActionLog)
    });
  })
  .get("/server-status", async (c) => {
    const ownerError = await rejectIfNotOwner(c);
    if (ownerError) {
      return ownerError;
    }

    return c.json({ status: await buildAdminServerStatus() });
  })
  .get("/server-errors", async (c) => {
    const ownerError = await rejectIfNotOwner(c);
    if (ownerError) {
      return ownerError;
    }

    return c.json({ errors: listServerErrors() });
  })
  .get("/storage/s3", async (c) => {
    const ownerError = await rejectIfNotOwner(c, "storage");
    if (ownerError) {
      return ownerError;
    }

    const { setting, config } = await getStoredS3Setting();

    return c.json({
      settings: buildActiveS3SettingsResponse(setting, config)
    });
  })
  .post("/storage/s3", async (c) => {
    const ownerError = await rejectIfNotOwner(c, "storage");
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
      signedUrlTtlSeconds: body.data.signedUrlTtlSeconds,
      reserve: null
    };

    if (!nextConfig.accessKeyId || !nextConfig.secretAccessKey) {
      return c.json({ error: "Access key and Secret key are required" }, 400);
    }

    const currentReserve = currentConfig?.reserve ?? null;
    const reserveEndpoint = body.data.reserveEndpoint?.trim() ?? "";
    const reserveBucket = body.data.reserveBucket?.trim() ?? "";
    const reserveRegion = body.data.reserveRegion?.trim() || "us-east-1";
    const reserveAccessKeyId = body.data.reserveAccessKeyId || currentReserve?.accessKeyId || "";
    const reserveSecretAccessKey = body.data.reserveSecretAccessKey || currentReserve?.secretAccessKey || "";
    const wantsReserve = Boolean(reserveEndpoint || reserveBucket || body.data.reserveAccessKeyId || body.data.reserveSecretAccessKey || body.data.reservePublicBaseUrl);

    if (wantsReserve) {
      if (!reserveEndpoint || !reserveBucket || !reserveAccessKeyId || !reserveSecretAccessKey) {
        return c.json({ error: "Reserve S3 requires endpoint, bucket, access key and secret key" }, 400);
      }

      nextConfig.reserve = {
        endpoint: reserveEndpoint,
        region: reserveRegion,
        bucket: reserveBucket,
        accessKeyId: reserveAccessKeyId,
        secretAccessKey: reserveSecretAccessKey,
        publicBaseUrl: normalizeS3PublicBaseUrl(body.data.reservePublicBaseUrl)
      };
    }

    try {
      await testS3Connection(nextConfig);
      if (nextConfig.reserve) {
        await testS3Connection({ ...nextConfig.reserve, signedUrlTtlSeconds: nextConfig.signedUrlTtlSeconds, reserve: null });
      }
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

    await recordAdminAction(c, {
      action: "storage.s3.updated",
      entityType: "storage",
      entityId: storageSettingKey,
      summary: "Обновил настройки S3",
      metadata: {
        endpoint: nextConfig.endpoint,
        region: nextConfig.region,
        bucket: nextConfig.bucket,
        publicBaseUrl: nextConfig.publicBaseUrl,
        signedUrlTtlSeconds: nextConfig.signedUrlTtlSeconds,
        reserveConfigured: Boolean(nextConfig.reserve),
        reserveEndpoint: nextConfig.reserve?.endpoint ?? null,
        reserveRegion: nextConfig.reserve?.region ?? null,
        reserveBucket: nextConfig.reserve?.bucket ?? null,
        reservePublicBaseUrl: nextConfig.reserve?.publicBaseUrl ?? null
      }
    });

    return c.json({
      ok: true,
      settings: buildActiveS3SettingsResponse(savedSetting ?? setting, nextConfig)
    });
  })
  .get("/storage/s3/objects", async (c) => {
    const ownerError = await rejectIfNotOwner(c, "storage");
    if (ownerError) {
      return ownerError;
    }

    const prefix = c.req.query("prefix") ?? "";
    const cursor = c.req.query("cursor") ?? null;
    const target = s3StorageTargetSchema.catch("primary").parse(c.req.query("target"));

    try {
      const response = await listObjects({ prefix, cursor, limit: 50, target });
      const metadataByKey = await buildS3ObjectMetadata(response.objects.map((object) => object.key));
      return c.json({
        ...response,
        objects: response.objects.map((object) => ({
          ...object,
          ...classifyS3ObjectKey(object.key),
          entityTitle: metadataByKey.get(object.key)?.entityTitle ?? null,
          uploadedBy: metadataByKey.get(object.key)?.uploadedBy ?? null
        }))
      });
    } catch {
      return c.json({ error: "Unable to list S3 objects" }, 400);
    }
  })
  .post("/storage/s3/objects/url", async (c) => {
    const ownerError = await rejectIfNotOwner(c, "storage");
    if (ownerError) {
      return ownerError;
    }

    const body = s3ObjectPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid S3 object key" }, 400);
    }

    try {
      return c.json({ url: await getObjectReadUrl(body.data.key, body.data.target ?? "primary", { verifyReadable: true }) });
    } catch {
      return c.json({ error: "Unable to open S3 object" }, 400);
    }
  })
  .delete("/storage/s3/objects", async (c) => {
    const ownerError = await rejectIfNotOwner(c, "storage");
    if (ownerError) {
      return ownerError;
    }

    const body = s3ObjectPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid S3 object key" }, 400);
    }

    try {
      await deleteObject(body.data.key, body.data.target ?? "primary");
    } catch {
      return c.json({ error: "Unable to delete S3 object" }, 400);
    }

    await recordAdminAction(c, {
      action: "storage.s3.object.deleted",
      entityType: "storage",
      entityId: body.data.key,
      summary: `Удалил файл из S3: ${body.data.key}`,
      metadata: {
        key: body.data.key
      }
    });

    return c.json({ ok: true });
  })
  .get("/stats", async (c) => {
    const totalItems = await getPublishedItemsCount();
    const [usersCountRow] = await db.select({ value: count(users.id) }).from(users);
    const recentUsers = await db.query.users.findMany({
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit: 200
    });
    const communityMessages = await db.query.clubChatMessages.findMany({
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 10000,
      with: {
        user: true,
        topic: true
      }
    });
    const statsUsers = await Promise.all(recentUsers.map((user) => buildStatsUser(user, totalItems)));

    return c.json({
      totalUsers: usersCountRow?.value ?? statsUsers.length,
      activeUsers: statsUsers.filter((user) => user.membershipStatus === "active").length,
      completedItems: statsUsers.reduce((sum, user) => sum + user.completedItems, 0),
      totalItems,
      users: statsUsers,
      communityMessages: communityMessages.map((message) => ({
        id: message.id,
        topicId: message.topicId,
        topicTitle: message.topic.title,
        isSystem: message.isSystem,
        status: message.status,
        author: {
          id: message.user.id,
          telegramId: message.user.telegramId,
          firstName: message.user.firstName,
          username: message.user.username,
          photoUrl: message.user.photoUrl
        },
        createdAt: message.createdAt.toISOString()
      }))
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
    await createAppNotification({
      userId: user.id,
      kind: "client",
      title: body.data.status === "active" ? "Доступ открыт" : "Доступ закрыт",
      body:
        body.data.status === "active"
          ? `Доступ к клубу открыт до ${expiresAt.toLocaleDateString("ru-RU")}.`
          : "Доступ к клубу закрыт.",
      source: "client_access",
      sourceId: user.id
    }).catch(() => null);

    const accessDurationDays =
      body.data.status === "active" ? Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))) : 0;
    const accessSummary =
      body.data.status === "active"
        ? `Открыл доступ к клубу до ${expiresAt.toLocaleDateString("ru-RU")} (${accessDurationDays} дн.)`
        : "Закрыл доступ к клубу";

    await recordAdminAction(c, {
      action: "client.access.updated",
      entityType: "user",
      entityId: user.id,
      targetUserId: user.id,
      targetTelegramId: user.telegramId,
      summary: accessSummary,
      metadata: {
        status: body.data.status,
        expiresAt: expiresAt.toISOString(),
        durationDays: accessDurationDays
      }
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
        description: decodeModuleCategoryDescription(category.description),
        defaultCardLayout: decodeModuleCategoryDefaultCardLayout(category.description)
      }));
    const categoryIds = categories.map((category) => category.id);
    const materials = categoryIds.length
      ? await db.query.contentItems.findMany({
          where: and(inArray(contentItems.categoryId, categoryIds), isNull(contentItems.archivedUntil)),
          orderBy: [asc(contentItems.sortOrder), desc(contentItems.createdAt)]
        })
      : [];
    const deletedMaterials = categoryIds.length
      ? await db.query.contentItems.findMany({
          where: and(inArray(contentItems.categoryId, categoryIds), isNotNull(contentItems.archivedUntil), gt(contentItems.archivedUntil, new Date())),
          orderBy: [desc(contentItems.updatedAt)]
        })
      : [];

    return c.json({
      categories,
      materials: await Promise.all(materials.map(serializeAdminMaterial)),
      deletedMaterials: await Promise.all(deletedMaterials.map(serializeAdminMaterial))
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
        description: encodeModuleCategoryDescription(body.data.description, body.data.defaultCardLayout),
        sortOrder: sortRow?.value ?? 0,
        isPublished: true
      })
      .returning();

    if (!category) {
      return c.json({ error: "Unable to create category" }, 500);
    }

    await recordAdminAction(c, {
      action: "learning.category.created",
      entityType: "learning_category",
      entityId: category.id,
      summary: `Создал модуль "${category.title}"`,
      metadata: {
        title: category.title,
        isPublished: category.isPublished
      }
    });

    return c.json({
      ok: true,
      category: {
        id: category.id,
        slug: category.slug,
        title: category.title,
        description: decodeModuleCategoryDescription(category.description),
        defaultCardLayout: decodeModuleCategoryDefaultCardLayout(category.description),
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
        description: encodeModuleCategoryDescription(body.data.description, body.data.defaultCardLayout),
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

    await recordAdminAction(c, {
      action: "learning.category.updated",
      entityType: "learning_category",
      entityId: category.id,
      summary: `Обновил модуль "${category.title}"`,
      metadata: {
        title: category.title,
        isPublished: category.isPublished
      }
    });

    return c.json({
      ok: true,
      category: {
        id: category.id,
        slug: category.slug,
        title: category.title,
        description: decodeModuleCategoryDescription(category.description),
        defaultCardLayout: decodeModuleCategoryDefaultCardLayout(category.description),
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

    await recordAdminAction(c, {
      action: "learning.category.status_updated",
      entityType: "learning_category",
      entityId: category.id,
      summary: body.data.isPublished ? `Открыл модуль "${category.title}"` : `Скрыл модуль "${category.title}"`,
      metadata: {
        isPublished: body.data.isPublished
      }
    });

    return c.json({
      ok: true,
      category: {
        id: category.id,
        slug: category.slug,
        title: category.title,
        description: decodeModuleCategoryDescription(category.description),
        defaultCardLayout: decodeModuleCategoryDefaultCardLayout(category.description),
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
      await deleteLessonMaterialObjects(item.id);
      if (item.mediaObjectKey) {
        await deleteObject(item.mediaObjectKey).catch(() => null);
      }
      if (item.thumbnailObjectKey) {
        await deleteObject(item.thumbnailObjectKey).catch(() => null);
      }
    }

    await db.delete(contentCategories).where(eq(contentCategories.id, category.id));

    await recordAdminAction(c, {
      action: "learning.category.deleted",
      entityType: "learning_category",
      entityId: category.id,
      summary: `Удалил модуль "${category.title}"`,
      metadata: {
        title: category.title,
        itemsCount: category.items.length
      }
    });

    return c.json({ ok: true });
  })
  .post("/learning/materials/uploads", async (c) => {
    const body = adminLearningDirectUploadRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid upload payload" }, 400);
    }

    const { purpose, kind, fileName, sizeBytes } = body.data;
    const contentType =
      purpose === "media"
        ? kind
          ? getLearningMediaUploadContentType(kind, body.data.contentType, fileName)
          : null
        : body.data.contentType.startsWith("image/")
          ? body.data.contentType
          : null;

    if (!contentType || rejectInvalidDirectUploadSize(purpose, sizeBytes)) {
      return c.json({ error: "Invalid upload file" }, 400);
    }

    const objectKey =
      purpose === "media"
        ? buildLearningMediaObjectKey({ kind: kind as ContentKind, fileName, id: randomUUID(), now: new Date() })
        : buildLearningThumbnailObjectKey({ fileName, id: randomUUID(), now: new Date() });
    const upload = await createObjectUploadUrl({ key: objectKey, contentType });

    return c.json({
      uploadUrl: upload.uploadUrl,
      objectKey: upload.key,
      contentType,
      sizeBytes,
      expiresAt: upload.expiresAt.toISOString()
    });
  })
  .post("/learning/materials/uploads/multipart", async (c) => {
    const body = adminLearningDirectUploadRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid upload payload" }, 400);
    }

    const { purpose, kind, fileName, sizeBytes } = body.data;
    const contentType =
      purpose === "media"
        ? kind
          ? getLearningMediaUploadContentType(kind, body.data.contentType, fileName)
          : null
        : body.data.contentType.startsWith("image/")
          ? body.data.contentType
          : null;

    if (!contentType || rejectInvalidDirectUploadSize(purpose, sizeBytes)) {
      return c.json({ error: "Invalid upload file" }, 400);
    }

    const objectKey =
      purpose === "media"
        ? buildLearningMediaObjectKey({ kind: kind as ContentKind, fileName, id: randomUUID(), now: new Date() })
        : buildLearningThumbnailObjectKey({ fileName, id: randomUUID(), now: new Date() });
    const partSizeBytes = 8 * 1024 * 1024;
    const partsCount = Math.max(1, Math.ceil(sizeBytes / partSizeBytes));
    const upload = await createMultipartUpload({ key: objectKey, contentType, partsCount });

    return c.json({
      objectKey: upload.key,
      uploadId: upload.uploadId,
      contentType,
      sizeBytes,
      partSizeBytes,
      parts: upload.parts,
      expiresAt: upload.expiresAt.toISOString()
    });
  })
  .post("/learning/materials/uploads/multipart/complete", async (c) => {
    const body = adminLearningMultipartCompleteRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid multipart upload payload" }, 400);
    }

    try {
      const upload = await completeMultipartUpload({
        key: body.data.objectKey,
        uploadId: body.data.uploadId,
        parts: body.data.parts
      });

      return c.json({
        objectKey: upload.key,
        contentType: body.data.contentType,
        sizeBytes: body.data.sizeBytes
      });
    } catch (error) {
      recordServerError({
        error,
        title: "Не удалось собрать файл урока из частей",
        method: c.req.method,
        path: c.req.path,
        status: 400
      });
      await abortMultipartUpload({ key: body.data.objectKey, uploadId: body.data.uploadId }).catch(() => null);
      return c.json({ error: "Unable to complete multipart upload" }, 400);
    }
  })
  .post("/learning/materials/direct", async (c) => {
    const body = directLearningMaterialPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid material payload" }, 400);
    }

    const { categoryId, kind, title, cardLayout, isPublished } = body.data;
    const summary = normalizeOptionalText(body.data.summary);
    const materialBody = normalizeOptionalText(body.data.body);
    const category = await db.query.contentCategories.findFirst({
      where: eq(contentCategories.id, categoryId)
    });
    if (!category) {
      return c.json({ error: "Category not found" }, 404);
    }

    let mediaObjectKey: string | null = null;
    let mediaUrl: string | null = null;
    let mediaContentType: string | null = null;
    let mediaSizeBytes: number | null = null;
    let thumbnailObjectKey: string | null = null;
    let thumbnailContentType: string | null = null;
    let thumbnailSizeBytes: number | null = null;
    let verifiedMedia: Awaited<ReturnType<typeof verifyDirectUploadedObject>> | null = null;
    let verifiedThumbnail: Awaited<ReturnType<typeof verifyDirectUploadedObject>> | null = null;

    if (kind !== "text") {
      if (body.data.mediaUrl) {
        mediaUrl = body.data.mediaUrl;
      } else if (body.data.mediaObject) {
        verifiedMedia = await verifyDirectUploadedObject({ object: body.data.mediaObject, purpose: "media", kind });
        if (!verifiedMedia) {
          return c.json({ error: "Media file type does not match material kind" }, 400);
        }

        mediaObjectKey = verifiedMedia.objectKey;
        mediaContentType = verifiedMedia.contentType;
        mediaSizeBytes = verifiedMedia.sizeBytes;
      } else {
        return c.json({ error: "Media file is required" }, 400);
      }
    }

    if (body.data.thumbnailObject) {
      verifiedThumbnail = await verifyDirectUploadedObject({ object: body.data.thumbnailObject, purpose: "thumbnail" });
      if (!verifiedThumbnail) {
        return c.json({ error: "Thumbnail file must be an image" }, 400);
      }

      thumbnailObjectKey = verifiedThumbnail.objectKey;
      thumbnailContentType = verifiedThumbnail.contentType;
      thumbnailSizeBytes = verifiedThumbnail.sizeBytes;
    }

    const now = new Date();
    const [material] = await db
      .insert(contentItems)
      .values({
        categoryId,
        kind,
        title,
        summary,
        body: materialBody,
        cardLayout,
        mediaUrl,
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

    try {
      await replaceDirectLessonMaterials(material.id, body.data.materials);
    } catch {
      if (mediaObjectKey) {
        await deleteObject(mediaObjectKey).catch(() => null);
      }
      if (thumbnailObjectKey) {
        await deleteObject(thumbnailObjectKey).catch(() => null);
      }
      await db.delete(contentItems).where(eq(contentItems.id, material.id));
      return c.json({ error: "Invalid lesson materials" }, 400);
    }

    mirrorDirectUploadToReserve(verifiedMedia);
    mirrorDirectUploadToReserve(verifiedThumbnail);

    await recordAdminAction(c, {
      action: "learning.material.created",
      entityType: "learning_material",
      entityId: material.id,
      summary: `Создал урок "${material.title}"`,
      metadata: {
        title: material.title,
        kind: material.kind,
        categoryId: material.categoryId,
        isPublished: material.isPublished
      }
    });

    return c.json({
      ok: true,
      material: await serializeAdminMaterial(material)
    });
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

    await recordAdminAction(c, {
      action: "learning.material.created",
      entityType: "learning_material",
      entityId: material.id,
      summary: `Создал урок "${material.title}"`,
      metadata: {
        title: material.title,
        kind: material.kind,
        categoryId: material.categoryId,
        isPublished: material.isPublished
      }
    });

    return c.json({
      ok: true,
      material: await serializeAdminMaterial(material)
    });
  })
  .post("/learning/materials/:id/direct", async (c) => {
    const current = await db.query.contentItems.findFirst({
      where: eq(contentItems.id, c.req.param("id"))
    });
    if (!current) {
      return c.json({ error: "Material not found" }, 404);
    }

    const body = directLearningMaterialPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid material payload" }, 400);
    }

    const { categoryId, kind, title, cardLayout, isPublished, removeThumbnail } = body.data;
    const summary = normalizeOptionalText(body.data.summary);
    const materialBody = normalizeOptionalText(body.data.body);
    const category = await db.query.contentCategories.findFirst({
      where: eq(contentCategories.id, categoryId)
    });
    if (!category) {
      return c.json({ error: "Category not found" }, 404);
    }

    let mediaObjectKey = current.mediaObjectKey;
    let mediaUrl = current.mediaUrl;
    let mediaContentType = current.mediaContentType;
    let mediaSizeBytes = current.mediaSizeBytes;
    let thumbnailObjectKey = current.thumbnailObjectKey;
    let thumbnailUrl = current.thumbnailUrl;
    let thumbnailContentType = current.thumbnailContentType;
    let thumbnailSizeBytes = current.thumbnailSizeBytes;
    let verifiedMedia: Awaited<ReturnType<typeof verifyDirectUploadedObject>> | null = null;
    let verifiedThumbnail: Awaited<ReturnType<typeof verifyDirectUploadedObject>> | null = null;

    if (kind === "text") {
      if (current.mediaObjectKey) {
        await deleteObject(current.mediaObjectKey).catch(() => null);
      }
      mediaObjectKey = null;
      mediaUrl = null;
      mediaContentType = null;
      mediaSizeBytes = null;
    } else if (body.data.mediaUrl) {
      if (current.mediaObjectKey) {
        await deleteObject(current.mediaObjectKey).catch(() => null);
      }
      mediaObjectKey = null;
      mediaUrl = body.data.mediaUrl;
      mediaContentType = null;
      mediaSizeBytes = null;
    } else if (body.data.mediaObject) {
      verifiedMedia = await verifyDirectUploadedObject({ object: body.data.mediaObject, purpose: "media", kind });
      if (!verifiedMedia) {
        return c.json({ error: "Media file type does not match material kind" }, 400);
      }
      if (current.mediaObjectKey && current.mediaObjectKey !== verifiedMedia.objectKey) {
        await deleteObject(current.mediaObjectKey).catch(() => null);
      }
      mediaObjectKey = verifiedMedia.objectKey;
      mediaUrl = null;
      mediaContentType = verifiedMedia.contentType;
      mediaSizeBytes = verifiedMedia.sizeBytes;
    } else if (current.kind !== kind || (!current.mediaObjectKey && !current.mediaUrl)) {
      return c.json({ error: "Media file is required when changing material kind" }, 400);
    }

    if (removeThumbnail) {
      if (current.thumbnailObjectKey) {
        await deleteObject(current.thumbnailObjectKey).catch(() => null);
      }
      thumbnailObjectKey = null;
      thumbnailUrl = null;
      thumbnailContentType = null;
      thumbnailSizeBytes = null;
    } else if (body.data.thumbnailObject) {
      verifiedThumbnail = await verifyDirectUploadedObject({ object: body.data.thumbnailObject, purpose: "thumbnail" });
      if (!verifiedThumbnail) {
        return c.json({ error: "Thumbnail file must be an image" }, 400);
      }
      if (current.thumbnailObjectKey && current.thumbnailObjectKey !== verifiedThumbnail.objectKey) {
        await deleteObject(current.thumbnailObjectKey).catch(() => null);
      }
      thumbnailObjectKey = verifiedThumbnail.objectKey;
      thumbnailUrl = null;
      thumbnailContentType = verifiedThumbnail.contentType;
      thumbnailSizeBytes = verifiedThumbnail.sizeBytes;
    }

    const now = new Date();
    const [material] = await db
      .update(contentItems)
      .set({
        categoryId,
        kind,
        title,
        summary,
        body: materialBody,
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
        updatedAt: now
      })
      .where(eq(contentItems.id, current.id))
      .returning();

    if (!material) {
      return c.json({ error: "Unable to update material" }, 500);
    }

    try {
      await replaceDirectLessonMaterials(material.id, body.data.materials);
    } catch {
      return c.json({ error: "Invalid lesson materials" }, 400);
    }

    mirrorDirectUploadToReserve(verifiedMedia);
    mirrorDirectUploadToReserve(verifiedThumbnail);

    await recordAdminAction(c, {
      action: "learning.material.updated",
      entityType: "learning_material",
      entityId: material.id,
      summary: `Обновил урок "${material.title}"`,
      metadata: {
        title: material.title,
        kind: material.kind,
        categoryId: material.categoryId,
        isPublished: material.isPublished
      }
    });

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
    const shouldRemoveThumbnail = getFormValue(form, "removeThumbnail") === "true";

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

    if (shouldRemoveThumbnail) {
      if (current.thumbnailObjectKey) {
        await deleteObject(current.thumbnailObjectKey).catch(() => null);
      }
      thumbnailObjectKey = null;
      thumbnailUrl = null;
      thumbnailContentType = null;
      thumbnailSizeBytes = null;
    } else if (thumbnailFile instanceof File && thumbnailFile.size > 0) {
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

    await recordAdminAction(c, {
      action: "learning.material.updated",
      entityType: "learning_material",
      entityId: material.id,
      summary: `Обновил урок "${material.title}"`,
      metadata: {
        title: material.title,
        kind: material.kind,
        categoryId: material.categoryId,
        isPublished: material.isPublished
      }
    });

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

    await recordAdminAction(c, {
      action: "learning.material.status_updated",
      entityType: "learning_material",
      entityId: material.id,
      summary: body.data.isPublished ? `Открыл урок "${material.title}"` : `Скрыл урок "${material.title}"`,
      metadata: {
        isPublished: body.data.isPublished
      }
    });

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

    await recordAdminAction(c, {
      action: "learning.material.restored",
      entityType: "learning_material",
      entityId: material.id,
      summary: `Восстановил урок "${material.title}"`,
      metadata: {
        title: material.title
      }
    });

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

    await recordAdminAction(c, {
      action: "learning.material.deleted",
      entityType: "learning_material",
      entityId: material.id,
      summary: `Удалил урок "${material.title}"`,
      metadata: {
        title: material.title,
        archiveTtlDays: 7
      }
    });

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
      await recordAdminAction(c, {
        action: "moderation.lesson_comment.updated",
        entityType: "lesson_comment",
        entityId: id,
        targetUserId: comment.user.id,
        targetTelegramId: comment.user.telegramId,
        summary: `Изменил статус комментария урока на ${body.data.status}`,
        metadata: {
          status: body.data.status,
          reason: body.data.reason ?? null
        }
      });
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
        await recordAdminAction(c, {
          action: "moderation.chat_message.deleted",
          entityType: "chat_message",
          entityId: id,
          targetUserId: message.user.id,
          targetTelegramId: message.user.telegramId,
          summary: "Удалил сообщение в общении",
          metadata: {
            status: body.data.status,
            reason: body.data.reason ?? null,
            hardDelete: true
          }
        });
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
      await recordAdminAction(c, {
        action: "moderation.chat_message.updated",
        entityType: "chat_message",
        entityId: id,
        targetUserId: message.user.id,
        targetTelegramId: message.user.telegramId,
        summary: `Изменил статус сообщения в общении на ${body.data.status}`,
        metadata: {
          status: body.data.status,
          reason: body.data.reason ?? null
        }
      });
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

    await recordAdminAction(c, {
      action: "client.mute.created",
      entityType: "mute",
      entityId: mute.id,
      targetUserId: user.id,
      targetTelegramId: user.telegramId,
      summary: body.data.kind === "permanent" ? "Выдал бессрочное ограничение клиенту" : "Выдал временное ограничение клиенту",
      metadata: {
        kind: body.data.kind,
        reason: body.data.reason ?? null,
        expiresAt: expiresAt?.toISOString() ?? null
      }
    });

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

    await recordAdminAction(c, {
      action: "client.mute.revoked",
      entityType: "mute",
      entityId: mute.id,
      targetUserId: mute.user.id,
      targetTelegramId: mute.user.telegramId,
      summary: "Снял ограничение с клиента",
      metadata: {
        kind: mute.kind,
        reason: mute.reason
      }
    });

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
        roleLabel: null,
        isActive: true,
        permissions: [...newAdminDefaultPermissions],
        createdByUserId: c.get("userId")
      })
      .onConflictDoUpdate({
        target: adminUsers.telegramId,
        set: {
          isActive: true
        }
      });

    await recordAdminAction(c, {
      action: "admin.created",
      entityType: "admin",
      entityId: body.data.telegramId,
      targetTelegramId: body.data.telegramId,
      summary: "Добавил администратора",
      metadata: {
        telegramId: body.data.telegramId,
        permissions: [...newAdminDefaultPermissions]
      }
    });

    return c.json({ ok: true });
  })
  .patch("/admins/:telegramId", async (c) => {
    if (!(await isOwnerTelegramId(c.get("telegramUser").id))) {
      return c.json({ error: "Owner access required" }, 403);
    }

    const telegramId = c.req.param("telegramId");
    if (await isOwnerTelegramId(telegramId)) {
      return c.json({ error: "Owner permissions cannot be changed" }, 400);
    }

    const body = adminUpdatePayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid admin permissions payload" }, 400);
    }

    const values: Partial<typeof adminUsers.$inferInsert> = {};
    if ("roleLabel" in body.data) {
      values.roleLabel = body.data.roleLabel ?? null;
    }
    if (typeof body.data.isActive === "boolean") {
      values.isActive = body.data.isActive;
    }
    if (body.data.permissions) {
      values.permissions = normalizeAdminPermissions(body.data.permissions);
    }

    if (!Object.keys(values).length) {
      return c.json({ ok: true });
    }

    await db.update(adminUsers).set(values).where(eq(adminUsers.telegramId, telegramId));

    await recordAdminAction(c, {
      action: "admin.permissions.updated",
      entityType: "admin",
      entityId: telegramId,
      targetTelegramId: telegramId,
      summary: "Изменил права администратора",
      metadata: {
        roleLabel: "roleLabel" in body.data ? body.data.roleLabel ?? null : undefined,
        isActive: typeof body.data.isActive === "boolean" ? body.data.isActive : undefined,
        permissions: body.data.permissions ? normalizeAdminPermissions(body.data.permissions) : undefined
      }
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

    await recordAdminAction(c, {
      action: "owner.transferred",
      entityType: "owner",
      entityId: body.data.telegramId,
      targetTelegramId: body.data.telegramId,
      summary: "Передал владение клубом",
      metadata: {
        previousOwnerTelegramId: currentOwnerTelegramId,
        nextOwnerTelegramId: body.data.telegramId
      }
    });

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

    await recordAdminAction(c, {
      action: "admin.removed",
      entityType: "admin",
      entityId: telegramId,
      targetTelegramId: telegramId,
      summary: "Удалил администратора",
      metadata: {
        telegramId
      }
    });

    return c.json({ ok: true });
  });
