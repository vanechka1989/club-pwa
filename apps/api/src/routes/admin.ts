import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { randomUUID } from "node:crypto";
import { statfs, unlink } from "node:fs/promises";
import { cpus, freemem, loadavg, tmpdir, totalmem, uptime as systemUptime } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  acquisitionAttributionSchema,
  acquisitionLinkInputSchema,
  adminPermissionSchema,
  allAdminPermissions,
  deviceDiagnosticsSchema,
  newAdminDefaultPermissions,
  type AdminActionActor,
  adminLearningDirectUploadRequestSchema,
  adminLearningMultipartCompleteRequestSchema,
  adminLearningUploadedObjectSchema,
  normalizeExternalMediaUrl,
  isValidDisplayName,
  normalizeDisplayName,
  type AdminLearningMaterial,
  type AdminPermission,
  type AdminUserDetailResponse,
  type AdminUserModerationEvent,
  type AdminStatsUser,
  type ContentKind,
  type MediaSource,
  type MembershipStatus
} from "@club/shared";
import { getAcquisitionDashboard, getAcquisitionDayDetail, getUserAcquisition, listAcquisitionLinks } from "../acquisition/acquisitionAnalytics";
import { createAcquisitionLink, setAcquisitionLinkActive } from "../acquisition/acquisitionStore";
import { getOwnerTelegramId, getUserRole, hasAdminPermission, isOwnerTelegramId, normalizeAdminPermissions, ownerTelegramIdSettingKey } from "../admin/roles";
import { validateOwnerTransferTarget } from "../admin/ownerTransfer";
import { recordAdminAction } from "../admin/actionLog";
import { getS3DeletionAuditKey, hasS3DeletionSource, mergeS3DeletionSource } from "../admin/s3DeletionAudit";
import { buildConfiguredIntegrationHealth } from "../admin/integrationHealth";
import { getLearningEngagementDashboard, getLearningEngagementUsers, resolveLearningEngagementRange } from "../admin/learningEngagement";
import { buildMessageAuthor } from "../community/messageMetadata";
import { resolvePollEndedAt, summarizePollStatistics } from "../community/pollStats";
import { getCommunityRealtimeSubscriberCount, publishCommunityChange } from "../community/realtime";
import { verifyUploadedObjectMetadata } from "../learning/directUploadVerification";
import { db } from "../db/client";
import {
  acquisitionLinks,
  adminActionLogs,
  adminMailings,
  adminUsers,
  authEmailLoginCodes,
  authSessions,
  appNotifications,
  clubSettings,
  clubMessageAttachments,
  clubChatMessages,
  clubPolls,
  contentCategories,
  contentItems,
  idempotencyOperations,
  lessonMaterials,
  lessonComments,
  learningEngagementSessions,
  paymentProviders,
  subscriptions,
  supportTicketAttachments,
  userContentProgress,
  userAcquisitionAttributions,
  userDevices,
  userMutes,
  users
} from "../db/schema";
import { env } from "../env";
import { logger } from "../logger";
import { readHostMaintenanceStatus } from "../operations/hostMaintenanceStatus";
import { requestMetrics } from "../requestMetrics";
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
  invalidateS3RuntimeCache,
  listObjects,
  mirrorObjectToReserve,
  testS3Connection,
  uploadMultipartPart,
  uploadObject
} from "../storage/s3";
import { classifyS3ObjectKey } from "../storage/s3Object";
import { createFallbackS3ObjectSource, type S3ObjectSourceSnapshot } from "../storage/s3ObjectSource";
import { isValidMultipartPartSize, maxMultipartPartSizeBytes } from "../storage/s3MultipartPart";
import { optimizeImageForUpload } from "../storage/imageOptimizer";
import { getFirstVisualLessonCoverUrl } from "../learning/lessonCover";
import { getInternalLessonMaterialTitle } from "../learning/lessonMaterials";
import {
  decideLearningSaveClaim,
  idempotencyOperationTtlMs,
  learningMaterialCreateScope
} from "../learning/learningSaveIdempotency";
import { createRequestFingerprint } from "../idempotency/operation";
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
import { validateReorderIds } from "../learning/reorder";
import {
  buildPgDumpArgs,
  buildPgRestoreArgs,
  consumeDatabaseBackupDownloadToken,
  createDatabaseBackupDownloadToken,
  databaseRestoreConfirmationText,
  getDatabaseBackupFileName,
  validateDatabaseRestoreConfirmation
} from "../db/backup";
import { getAdminUserReferrals, getReferralRewardDays, updateReferralRewardDays } from "../referrals/referrals";
import { createLoginCode, hashAuthToken, normalizeEmail } from "../auth/emailAuth";

const userIdentifierSchema = z.string().trim().min(3).max(320);

const acquisitionDashboardQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  attribution: acquisitionAttributionSchema.default("last")
});
const acquisitionDayQuerySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const acquisitionLinkStatusSchema = z.object({ isActive: z.boolean() });

const adminPayloadSchema = z.object({
  telegramId: userIdentifierSchema
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
  telegramId: userIdentifierSchema
});

const accessPayloadSchema = z.object({
  telegramId: userIdentifierSchema,
  status: z.enum(["inactive", "active", "expired"]),
  expiresAt: z.string().datetime().nullable().optional()
});

const projectSettingsPayloadSchema = z.object({
  referralRewardDays: z.number().int().positive().max(3650)
});

const ownerEmailLoginCodePayloadSchema = z.object({
  email: z.string().trim().min(3).max(320)
});

const ownerEmailLoginCodeCooldownSeconds = 30;

const moderationStatusPayloadSchema = z.object({
  status: z.enum(["visible", "hidden", "deleted"]),
  reason: z.string().trim().max(1000).nullable().optional()
});

const mutePayloadSchema = z.object({
  telegramId: userIdentifierSchema,
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

const learningReorderPayloadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500)
});

const learningMaterialReorderPayloadSchema = learningReorderPayloadSchema.extend({
  categoryId: z.string().uuid()
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
const learningMultipartPartQuerySchema = z.object({
  objectKey: z.string().trim().min(1),
  uploadId: z.string().trim().min(1),
  partNumber: z.coerce.number().int().positive().max(1000)
});
const idempotencyKeySchema = z.string().uuid();

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
        title: z.string().trim().max(160).optional().default(""),
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
  coverMode: z.enum(["default", "custom", "first_material"]).default("default"),
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

async function getNextMaterialSortOrder(categoryId: string) {
  const [lastItem] = await db.query.contentItems.findMany({
    where: and(eq(contentItems.categoryId, categoryId), isNull(contentItems.archivedUntil)),
    orderBy: [desc(contentItems.sortOrder), desc(contentItems.createdAt)],
    limit: 1
  });

  return (lastItem?.sortOrder ?? -1) + 1;
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

  const verification = await verifyUploadedObjectMetadata({
    expected: object,
    loadMetadata: getObjectMetadata
  });
  if (!verification.ok) {
    logger.warn(
      {
        objectKey: object.objectKey,
        purpose,
        kind,
        reason: verification.reason,
        detail: verification.detail
      },
      "Direct learning upload verification failed"
    );
    return null;
  }

  return {
    objectKey: verification.metadata.key,
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

  for (const [materialIndex, material] of materials.entries()) {
    let verifiedMedia: Awaited<ReturnType<typeof verifyDirectUploadedObject>> | null = null;
    const mediaUrl = material.mediaUrl ?? null;
    const internalTitle = getInternalLessonMaterialTitle(material.kind, material.title, materialIndex);

    if (material.kind === "text") {
      verifiedMaterials.push({
        kind: material.kind,
        title: internalTitle,
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
        title: internalTitle,
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
        title: internalTitle,
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
      title: internalTitle,
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
  const materials = await getSerializedLessonMaterials(item.id);

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
    coverMode: item.coverMode === "custom" || item.coverMode === "first_material" ? item.coverMode : "default",
    coverSourceUrl: getFirstVisualLessonCoverUrl({ kind: item.kind, mediaUrl }, materials),
    cardLayout: item.cardLayout === "horizontal" ? "horizontal" : "vertical",
    mediaContentType: item.mediaContentType,
    mediaSizeBytes: item.mediaSizeBytes,
    materials,
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

type ClientAcquisitionSummary = NonNullable<AdminStatsUser["acquisition"]>;

async function getClientAcquisitionSummaries(userIds: string[]) {
  if (!userIds.length) {
    return new Map<string, ClientAcquisitionSummary>();
  }

  const rows = await db
    .select({
      userId: userAcquisitionAttributions.userId,
      source: acquisitionLinks.source,
      medium: acquisitionLinks.medium,
      campaign: acquisitionLinks.campaign,
      content: acquisitionLinks.content
    })
    .from(userAcquisitionAttributions)
    .innerJoin(acquisitionLinks, eq(userAcquisitionAttributions.lastLinkId, acquisitionLinks.id))
    .where(inArray(userAcquisitionAttributions.userId, userIds));

  return new Map(rows.map((row) => [row.userId, {
    source: row.source,
    medium: row.medium,
    campaign: row.campaign,
    content: row.content
  }]));
}

async function buildStatsUser(
  user: typeof users.$inferSelect,
  totalItems: number,
  acquisitionByUserId?: Map<string, ClientAcquisitionSummary>
): Promise<AdminStatsUser> {
  const resolvedAcquisitionByUserId = acquisitionByUserId ?? await getClientAcquisitionSummaries([user.id]);
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
  const latestSession = await db.query.authSessions.findFirst({
    where: eq(authSessions.userId, user.id),
    orderBy: [desc(authSessions.lastSeenAt)]
  });
  const photoUrl = user.avatarObjectKey
    ? await getObjectReadUrl(user.avatarObjectKey).catch((error) => {
        logger.warn({ error, userId: user.id, avatarObjectKey: user.avatarObjectKey }, "Failed to build admin avatar read URL");
        return user.photoUrl;
      })
    : user.photoUrl;

  return {
    id: user.id,
    telegramId: user.telegramId,
    email: user.email,
    marketingEmailOptOutAt: user.marketingEmailOptOutAt?.toISOString() ?? null,
    firstName: user.firstName,
    username: user.username,
    displayName: user.displayName,
    displayNameChangedByUserAt: user.displayNameChangedByUserAt?.toISOString() ?? null,
    photoUrl,
    role,
    membershipStatus: membership.status,
    membershipExpiresAt: membership.subscription?.expiresAt?.toISOString() ?? null,
    tariff: membership.subscription?.provider ?? null,
    hasRestrictions: Boolean(activeMute),
    completedItems: completedRow?.value ?? 0,
    totalItems,
    lastOpenedItemTitle: lastOpened?.item?.title ?? null,
    lastOpenedAt: lastOpened?.lastOpenedAt.toISOString() ?? null,
    lastLoginAt: (latestSession?.lastSeenAt ?? user.createdAt).toISOString(),
    telegramBotStatus: user.telegramBotStatus as AdminStatsUser["telegramBotStatus"],
    telegramBotBlockedAt: user.telegramBotBlockedAt?.toISOString() ?? null,
    telegramBotUnblockedAt: user.telegramBotUnblockedAt?.toISOString() ?? null,
    acquisition: resolvedAcquisitionByUserId.get(user.id) ?? null,
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
    storageMaintenance: await readHostMaintenanceStatus(),
    serverErrorCount: await countServerErrors(),
    requestMetrics: requestMetrics.snapshot()
  };
}

function buildDatabaseToolError(tool: string, detail: string) {
  const trimmedDetail = detail.trim();
  if (trimmedDetail) {
    return `${tool} завершился с ошибкой: ${trimmedDetail}`;
  }

  return `${tool} завершился с ошибкой. Проверьте, что PostgreSQL client установлен на сервере.`;
}

async function runDatabaseBackupDump() {
  let processResult: Bun.Subprocess<"pipe", "pipe", "pipe">;
  try {
    processResult = Bun.spawn(["pg_dump", ...buildPgDumpArgs(env.DATABASE_URL)], {
      stdout: "pipe",
      stderr: "pipe"
    });
  } catch (error) {
    logger.error({ error }, "Unable to start pg_dump");
    throw new Error("Не удалось запустить pg_dump. PostgreSQL client не установлен на сервере.");
  }

  const [exitCode, output, detail] = await Promise.all([
    processResult.exited,
    new Response(processResult.stdout).arrayBuffer(),
    new Response(processResult.stderr).text()
  ]);

  if (exitCode !== 0) {
    logger.error({ exitCode, detail }, "pg_dump failed");
    throw new Error(buildDatabaseToolError("pg_dump", detail));
  }

  return output;
}

async function runDatabaseRestore(filePath: string) {
  let processResult: Bun.Subprocess<"pipe", "pipe", "pipe">;
  try {
    processResult = Bun.spawn(["pg_restore", ...buildPgRestoreArgs(env.DATABASE_URL, filePath)], {
      stdout: "pipe",
      stderr: "pipe"
    });
  } catch (error) {
    logger.error({ error }, "Unable to start pg_restore");
    throw new Error("Не удалось запустить pg_restore. PostgreSQL client не установлен на сервере.");
  }

  const [exitCode, output, detail] = await Promise.all([
    processResult.exited,
    new Response(processResult.stdout).text(),
    new Response(processResult.stderr).text()
  ]);

  if (exitCode !== 0) {
    logger.error({ exitCode, output, detail }, "pg_restore failed");
    throw new Error(buildDatabaseToolError("pg_restore", detail || output));
  }
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

type S3ObjectMetadata = {
  entityTitle: string | null;
  uploadedBy: AdminActionActor | null;
  source: S3ObjectSourceSnapshot;
};

async function buildS3ObjectMetadata(keys: string[]) {
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  const metadataByKey = new Map<string, S3ObjectMetadata>();
  if (!uniqueKeys.length) {
    return metadataByKey;
  }

  for (const key of uniqueKeys) {
    metadataByKey.set(key, {
      entityTitle: null,
      uploadedBy: null,
      source: createFallbackS3ObjectSource(key)
    });
  }

  const [items, materials, communityAttachments, supportAttachments, notifications, mailings] = await Promise.all([
    db.query.contentItems.findMany({
      where: or(inArray(contentItems.mediaObjectKey, uniqueKeys), inArray(contentItems.thumbnailObjectKey, uniqueKeys))
    }),
    db.query.lessonMaterials.findMany({
      where: inArray(lessonMaterials.mediaObjectKey, uniqueKeys),
      with: { item: true }
    }),
    db.query.clubMessageAttachments.findMany({
      where: inArray(clubMessageAttachments.objectKey, uniqueKeys),
      with: {
        message: {
          with: {
            topic: true,
            user: true
          }
        }
      }
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

  for (const item of items) {
    if (item.mediaObjectKey) {
      metadataByKey.set(item.mediaObjectKey, {
        entityTitle: item.title,
        uploadedBy: null,
        source: {
          ...createFallbackS3ObjectSource(item.mediaObjectKey),
          sourceKind: "learning",
          sourceTitle: item.title,
          resolved: true
        }
      });
    }
    if (item.thumbnailObjectKey) {
      metadataByKey.set(item.thumbnailObjectKey, {
        entityTitle: item.title,
        uploadedBy: null,
        source: {
          ...createFallbackS3ObjectSource(item.thumbnailObjectKey),
          sourceKind: "learning",
          sourceTitle: item.title,
          resolved: true
        }
      });
    }
  }

  for (const material of materials) {
    if (!material.mediaObjectKey) {
      continue;
    }
    metadataByKey.set(material.mediaObjectKey, {
      entityTitle: material.title,
      uploadedBy: null,
      source: {
        ...createFallbackS3ObjectSource(material.mediaObjectKey),
        sourceKind: "lesson_material",
        sourceTitle: material.title,
        parentTitle: material.item?.title ?? null,
        resolved: true
      }
    });
  }

  for (const attachment of communityAttachments) {
    const topicTitle = attachment.message?.topic?.title ?? null;
    metadataByKey.set(attachment.objectKey, {
      entityTitle: topicTitle,
      uploadedBy: serializeStorageUploader(attachment.message?.user),
      source: {
        ...createFallbackS3ObjectSource(attachment.objectKey),
        sourceKind: "community",
        sourceTitle: topicTitle,
        resolved: Boolean(topicTitle)
      }
    });
  }

  for (const attachment of supportAttachments) {
    const sourceTitle = attachment.ticket?.customTopic ?? attachment.ticket?.topic ?? attachment.fileName;
    metadataByKey.set(attachment.objectKey, {
      entityTitle: sourceTitle,
      uploadedBy: serializeStorageUploader(attachment.message?.author),
      source: {
        ...createFallbackS3ObjectSource(attachment.objectKey),
        sourceKind: "support",
        sourceTitle,
        resolved: true
      }
    });
  }

  for (const notification of notifications) {
    if (!notification.attachmentObjectKey) {
      continue;
    }
    metadataByKey.set(notification.attachmentObjectKey, {
      entityTitle: notification.title,
      uploadedBy: serializeStorageUploader(notification.user),
      source: {
        ...createFallbackS3ObjectSource(notification.attachmentObjectKey),
        sourceKind: "notification",
        sourceTitle: notification.title,
        resolved: true
      }
    });
  }

  for (const mailing of mailings) {
    if (!mailing.attachmentObjectKey) {
      continue;
    }
    metadataByKey.set(mailing.attachmentObjectKey, {
      entityTitle: mailing.title,
      uploadedBy: serializeStorageUploader(mailing.createdBy),
      source: {
        ...createFallbackS3ObjectSource(mailing.attachmentObjectKey),
        sourceKind: "mailing",
        sourceTitle: mailing.title,
        resolved: true
      }
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
  const [statsUser, userSubscriptions, mutes, comments, messages, userReferrals, userDeviceHistory, learningEngagementRows] = await Promise.all([
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
    }),
    getAdminUserReferrals(user.id),
    db.query.userDevices.findMany({
      where: eq(userDevices.userId, user.id),
      orderBy: [desc(userDevices.lastSeenAt)],
      limit: 30
    }),
    db
      .select({
        contentItemId: learningEngagementSessions.contentItemId,
        title: contentItems.title,
        categoryTitle: contentCategories.title,
        activeSeconds: learningEngagementSessions.activeSeconds,
        videoSeconds: learningEngagementSessions.videoSeconds,
        lastViewedAt: learningEngagementSessions.lastActivityAt
      })
      .from(learningEngagementSessions)
      .innerJoin(contentItems, eq(contentItems.id, learningEngagementSessions.contentItemId))
      .innerJoin(contentCategories, eq(contentCategories.id, contentItems.categoryId))
      .where(eq(learningEngagementSessions.userId, user.id))
      .orderBy(desc(learningEngagementSessions.lastActivityAt))
      .limit(500)
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

  const devices = userDeviceHistory.flatMap((entry) => {
    const diagnostics = deviceDiagnosticsSchema.safeParse(entry.diagnostics);
    return diagnostics.success
      ? [{
          id: entry.id,
          firstSeenAt: entry.firstSeenAt.toISOString(),
          lastSeenAt: entry.lastSeenAt.toISOString(),
          diagnostics: diagnostics.data
        }]
      : [];
  });
  const legacyDevice = user.deviceSnapshot ? deviceDiagnosticsSchema.safeParse(user.deviceSnapshot) : null;
  const device = devices[0]?.diagnostics ?? (legacyDevice?.success ? legacyDevice.data : null);
  const learningEngagementByItem = new Map<string, {
    contentItemId: string;
    title: string;
    categoryTitle: string;
    opens: number;
    totalActiveSeconds: number;
    videoSeconds: number;
    lastViewedAt: string;
  }>();
  for (const row of learningEngagementRows) {
    const existing = learningEngagementByItem.get(row.contentItemId);
    if (existing) {
      existing.opens += 1;
      existing.totalActiveSeconds += row.activeSeconds;
      existing.videoSeconds += row.videoSeconds;
      continue;
    }
    learningEngagementByItem.set(row.contentItemId, {
      contentItemId: row.contentItemId,
      title: row.title,
      categoryTitle: row.categoryTitle,
      opens: 1,
      totalActiveSeconds: row.activeSeconds,
      videoSeconds: row.videoSeconds,
      lastViewedAt: row.lastViewedAt.toISOString()
    });
  }

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
    device,
    devices,
    referrals: userReferrals,
    learningEngagement: [...learningEngagementByItem.values()]
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
  .get("/database/backup-download/:token", async (c) => {
    const token = c.req.param("token");
    if (!consumeDatabaseBackupDownloadToken(token)) {
      return c.json({ error: "Ссылка на скачивание устарела. Создайте новую резервную копию." }, 410);
    }

    try {
      const dump = await runDatabaseBackupDump();
      const fileName = getDatabaseBackupFileName();

      return new Response(dump, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось выгрузить базу.";
      logger.error({ error }, "Unable to create database backup from download token");
      return c.json({ error: message }, 500);
    }
  })
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
  .use("/login-ips/*", requireAdminPermission("login_ips"))
  .use("/stats", requireAnyAdminPermission(["statistics", "users"]))
  .use("/stats/*", requireAnyAdminPermission(["statistics", "users"]))
  .use("/acquisition", requireAdminPermission("statistics"))
  .use("/acquisition/*", requireAdminPermission("statistics"))
  .use("/analytics/learning-engagement", requireAdminPermission("statistics"))
  .use("/analytics/learning-engagement/*", requireAdminPermission("statistics"))
  .use("/users/:telegramId/acquisition", requireAdminPermission("statistics"))
  .use("/access", requireAdminPermission("accesses"))
  .use("/learning", requireAdminPermission("materials"))
  .use("/learning/*", requireAdminPermission("materials"))
  .use("/moderation", requireAnyAdminPermission(["materials", "community"]))
  .use("/moderation/*", requireAnyAdminPermission(["materials", "community"]))
  .use("/mutes", requireAdminPermission("users"))
  .use("/mutes/*", requireAdminPermission("users"))
  .use("/storage/s3", requireAdminPermission("storage"))
  .use("/storage/s3/*", requireAdminPermission("storage"))
  .use("/project-settings", requireAdminPermission("project_settings"))
  .use("/settings-audit", requireAdminPermission("project_settings"))
  .get("/acquisition/dashboard", async (c) => {
    const query = acquisitionDashboardQuerySchema.safeParse(c.req.query());
    if (!query.success) return c.json({ error: query.error.flatten() }, 400);
    return c.json(await getAcquisitionDashboard({
      attribution: query.data.attribution,
      from: query.data.from ? new Date(query.data.from) : null,
      to: query.data.to ? new Date(query.data.to) : null,
      origin: env.WEB_ORIGIN
    }));
  })
  .get("/acquisition/day", async (c) => {
    const query = acquisitionDayQuerySchema.safeParse(c.req.query());
    if (!query.success) return c.json({ error: query.error.flatten() }, 400);
    return c.json(await getAcquisitionDayDetail(query.data.date));
  })
  .get("/acquisition/links", async (c) => c.json({ links: await listAcquisitionLinks(env.WEB_ORIGIN) }))
  .post("/acquisition/links", async (c) => {
    const body = acquisitionLinkInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);
    let created;
    try {
      created = await createAcquisitionLink(body.data, c.get("userId"));
    } catch (error) {
      if (error instanceof Error && error.message === "ACQUISITION_SLUG_CONFLICT") {
        return c.json({ error: "Короткий адрес уже занят" }, 409);
      }
      throw error;
    }
    await recordAdminAction(c, {
      action: "acquisition.link.created",
      entityType: "acquisition_link",
      entityId: created.id,
      summary: `Создал метку «${created.name}»`,
      metadata: { source: created.source, medium: created.medium, campaign: created.campaign }
    });
    const link = (await listAcquisitionLinks(env.WEB_ORIGIN)).find((item) => item.id === created.id);
    return c.json(link ?? created, 201);
  })
  .patch("/acquisition/links/:id", async (c) => {
    const id = z.string().uuid().safeParse(c.req.param("id"));
    const body = acquisitionLinkStatusSchema.safeParse(await c.req.json().catch(() => null));
    if (!id.success || !body.success) return c.json({ error: "Invalid acquisition link request" }, 400);
    const updated = await setAcquisitionLinkActive(id.data, body.data.isActive);
    if (!updated) return c.json({ error: "Acquisition link not found" }, 404);
    await recordAdminAction(c, {
      action: "acquisition.link.status_changed",
      entityType: "acquisition_link",
      entityId: updated.id,
      summary: `${updated.isActive ? "Включил" : "Отключил"} метку «${updated.name}»`,
      metadata: { isActive: updated.isActive }
    });
    const link = (await listAcquisitionLinks(env.WEB_ORIGIN)).find((item) => item.id === updated.id);
    return c.json(link ?? updated);
  })
  .get("/users/:telegramId/acquisition", async (c) => {
    const user = await db.query.users.findFirst({ where: eq(users.telegramId, c.req.param("telegramId")) });
    if (!user) return c.json({ error: "User not found" }, 404);
    return c.json(await getUserAcquisition(user.id));
  })
  .get("/login-ips/:telegramId", async (c) => {
    const user = await db.query.users.findFirst({
      where: eq(users.telegramId, c.req.param("telegramId"))
    });
    if (!user) return c.json({ error: "User not found" }, 404);

    const loginIps = await db.query.userLoginIps.findMany({
      where: (table, { eq }) => eq(table.userId, user.id),
      orderBy: (table, { desc }) => [desc(table.lastSeenAt)]
    });
    c.header("Cache-Control", "no-store");
    return c.json({
      loginIps: loginIps.map((entry) => ({
        id: entry.id,
        ipAddress: entry.ipAddress,
        firstSeenAt: entry.firstSeenAt.toISOString(),
        lastSeenAt: entry.lastSeenAt.toISOString(),
        loginCount: entry.loginCount
      }))
    });
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
  .get("/project-settings", async (c) => {
    return c.json({
      settings: {
        referralRewardDays: await getReferralRewardDays()
      }
    });
  })
  .get("/settings-audit", async (c) => {
    const logs = await db.query.adminActionLogs.findMany({
      where: or(
        sql`${adminActionLogs.action} like 'project.settings.%'`,
        sql`${adminActionLogs.action} like 'storage.s3.%'`,
        sql`${adminActionLogs.action} like 'payment.provider.%'`
      ),
      orderBy: [desc(adminActionLogs.createdAt)],
      limit: 100,
      with: { actor: true, targetUser: true }
    });
    const actorIds = Array.from(new Set(logs.map((log) => log.actorTelegramId)));
    const profiles = actorIds.length
      ? await db.query.users.findMany({ where: inArray(users.telegramId, actorIds) })
      : [];
    const profilesByTelegramId = new Map(profiles.map((profile) => [profile.telegramId, profile]));
    const deletionKeys = logs
      .filter((log) => !hasS3DeletionSource(log.metadata))
      .map(getS3DeletionAuditKey)
      .filter((key): key is string => Boolean(key));
    let deletionMetadata = new Map<string, S3ObjectMetadata>();
    if (deletionKeys.length) {
      try {
        deletionMetadata = await buildS3ObjectMetadata(deletionKeys);
      } catch (error) {
        logger.warn({ error }, "Unable to enrich historical S3 deletion audit entries");
      }
    }

    return c.json({
      admins: actorIds.map((telegramId) => serializeAdminActionActor(telegramId, profilesByTelegramId.get(telegramId))),
      logs: logs.map((log) => {
        const key = getS3DeletionAuditKey(log);
        const metadata = key && !hasS3DeletionSource(log.metadata)
          ? mergeS3DeletionSource(log.metadata, deletionMetadata.get(key)?.source ?? createFallbackS3ObjectSource(key))
          : log.metadata;
        return serializeAdminActionLog({
          ...log,
          metadata,
          actor: profilesByTelegramId.get(log.actorTelegramId) ?? log.actor
        });
      })
    });
  })
  .post("/project-settings", async (c) => {
    const body = projectSettingsPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid project settings payload" }, 400);
    }

    const referralRewardDays = await updateReferralRewardDays(body.data.referralRewardDays, c.get("userId"));
    await recordAdminAction(c, {
      action: "project.settings.updated",
      entityType: "club_settings",
      entityId: "project",
      summary: `Обновил реферальное вознаграждение: ${referralRewardDays} дн.`,
      metadata: {
        referralRewardDays
      }
    });

    return c.json({
      ok: true,
      settings: {
        referralRewardDays
      }
    });
  })
  .post("/owner-email-login-code", async (c) => {
    const ownerError = await rejectIfNotOwner(c);
    if (ownerError) {
      return ownerError;
    }

    const body = ownerEmailLoginCodePayloadSchema.safeParse(await c.req.json().catch(() => null));
    const email = body.success ? normalizeEmail(body.data.email) : null;
    if (!email) {
      return c.json({ error: "Введите корректный email клиента." }, 400);
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, email)
    });

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);

      const now = new Date();
      const cooldownStartedAt = new Date(now.getTime() - ownerEmailLoginCodeCooldownSeconds * 1000);
      const latestOwnerCode = await tx.query.adminActionLogs.findFirst({
        where: and(
          eq(adminActionLogs.action, "owner.email_login_code.generated"),
          sql`${adminActionLogs.metadata} ->> 'email' = ${email}`,
          gt(adminActionLogs.createdAt, cooldownStartedAt)
        ),
        orderBy: [desc(adminActionLogs.createdAt)]
      });
      if (latestOwnerCode) {
        return {
          ok: false as const,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((latestOwnerCode.createdAt.getTime() + ownerEmailLoginCodeCooldownSeconds * 1000 - now.getTime()) / 1000)
          )
        };
      }

      const code = createLoginCode();
      const expiresAt = new Date(now.getTime() + env.AUTH_LOGIN_CODE_TTL_MINUTES * 60 * 1000);
      await tx
        .update(authEmailLoginCodes)
        .set({ consumedAt: now })
        .where(and(eq(authEmailLoginCodes.email, email), isNull(authEmailLoginCodes.consumedAt)));
      await tx.insert(authEmailLoginCodes).values({
        email,
        codeHash: hashAuthToken(`${email}:${code}`),
        expiresAt
      });
      await tx.insert(adminActionLogs).values({
        actorUserId: c.get("userId"),
        actorTelegramId: c.get("telegramUser").id,
        action: "owner.email_login_code.generated",
        entityType: "user",
        entityId: user?.id ?? email,
        targetUserId: user?.id ?? null,
        targetTelegramId: user?.telegramId ?? null,
        summary: `Создал аварийный код входа для ${email}`,
        metadata: { email, expiresAt: expiresAt.toISOString() }
      });

      return { ok: true as const, code, expiresAt };
    });

    if (!result.ok) {
      return c.json(
        { error: `Сгенерировать новый код можно через ${result.retryAfterSeconds}с.`, retryAfterSeconds: result.retryAfterSeconds },
        429
      );
    }

    return c.json({
      ok: true,
      email,
      code: result.code,
      expiresAt: result.expiresAt.toISOString()
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

    return c.json({ errors: await listServerErrors() });
  })
  .get("/integration-health", async (c) => {
    const ownerError = await rejectIfNotOwner(c);
    if (ownerError) return ownerError;

    const [provider, storedS3] = await Promise.all([
      db.query.paymentProviders.findFirst({ where: eq(paymentProviders.provider, "prodamus") }),
      getStoredS3Setting()
    ]);
    const s3 = storedS3.config ?? getS3ConfigFromEnv(env);
    const items = buildConfiguredIntegrationHealth({
      smtp: { host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER, password: env.SMTP_PASSWORD },
      s3: {
        endpoint: s3?.endpoint,
        bucket: s3?.bucket,
        accessKeyId: s3?.accessKeyId,
        secretAccessKey: s3?.secretAccessKey
      },
      payment: { enabled: Boolean(provider?.isEnabled), hasSecret: Boolean(provider?.secretKey) },
      realtime: { enabled: true, subscriberCount: getCommunityRealtimeSubscriberCount() }
    });

    try {
      await db.execute(sql`select 1`);
    } catch (error) {
      const database = items.find((item) => item.id === "database");
      if (database) {
        database.status = "error";
        database.detail = "PostgreSQL не отвечает.";
      }
      logger.error({ error }, "Admin integration health database check failed");
    }

    return c.json({ checkedAt: new Date().toISOString(), items });
  })
  .post("/database/backup-link", async (c) => {
    const ownerError = await rejectIfNotOwner(c);
    if (ownerError) {
      return ownerError;
    }

    const { token, expiresAt } = createDatabaseBackupDownloadToken(randomUUID());

    await recordAdminAction(c, {
      action: "database.backup.link_created",
      entityType: "database",
      summary: "Создана одноразовая ссылка для скачивания базы",
      metadata: { expiresAt: expiresAt.toISOString() }
    }).catch((error) => logger.warn({ error }, "Unable to record database backup link action"));

    return c.json({
      url: `/admin/database/backup-download/${token}`,
      expiresAt: expiresAt.toISOString()
    });
  })
  .get("/database/backup", async (c) => {
    const ownerError = await rejectIfNotOwner(c);
    if (ownerError) {
      return ownerError;
    }

    try {
      const dump = await runDatabaseBackupDump();
      const fileName = getDatabaseBackupFileName();

      await recordAdminAction(c, {
        action: "database.backup.downloaded",
        entityType: "database",
        summary: "Скачана резервная копия базы",
        metadata: { fileName, sizeBytes: dump.byteLength }
      }).catch((error) => logger.warn({ error }, "Unable to record database backup action"));

      return new Response(dump, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Cache-Control": "no-store"
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось выгрузить базу.";
      logger.error({ error }, "Unable to create database backup");
      return c.json({ error: message }, 500);
    }
  })
  .post("/database/restore", async (c) => {
    const ownerError = await rejectIfNotOwner(c);
    if (ownerError) {
      return ownerError;
    }

    const form = await c.req.raw.formData().catch(() => null);
    if (!form) {
      return c.json({ error: "Не удалось прочитать файл резервной копии." }, 400);
    }

    const confirmation = String(form.get("confirmation") ?? "");
    if (!validateDatabaseRestoreConfirmation(confirmation)) {
      return c.json({ error: `Для восстановления введите ${databaseRestoreConfirmationText}.` }, 400);
    }

    const file = form.get("backup");
    if (!(file instanceof File) || file.size <= 0) {
      return c.json({ error: "Выберите файл резервной копии базы." }, 400);
    }

    const tempFilePath = join(tmpdir(), `club-restore-${randomUUID()}.dump`);

    try {
      await Bun.write(tempFilePath, file);
      await runDatabaseRestore(tempFilePath);

      await recordAdminAction(c, {
        action: "database.backup.restored",
        entityType: "database",
        summary: "База восстановлена из резервной копии",
        metadata: { fileName: file.name, sizeBytes: file.size }
      }).catch((error) => logger.warn({ error }, "Unable to record database restore action"));

      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось восстановить базу.";
      logger.error({ error }, "Unable to restore database backup");
      return c.json({ error: message }, 500);
    } finally {
      await unlink(tempFilePath).catch(() => null);
    }
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

    invalidateS3RuntimeCache();

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

    let source = createFallbackS3ObjectSource(body.data.key);
    try {
      source = (await buildS3ObjectMetadata([body.data.key])).get(body.data.key)?.source ?? source;
    } catch (error) {
      logger.warn({ error, key: body.data.key }, "Unable to resolve S3 object source before deletion");
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
      summary: "Удалил файл из S3",
      metadata: mergeS3DeletionSource({ key: body.data.key }, source)
    });

    return c.json({ ok: true });
  })
  .get("/analytics/learning-engagement", async (c) => {
    try {
      const range = resolveLearningEngagementRange(c.req.query("from"), c.req.query("to"));
      return c.json(await getLearningEngagementDashboard(range.from, range.toExclusive));
    } catch {
      return c.json({ error: "Invalid learning engagement date range" }, 400);
    }
  })
  .get("/analytics/learning-engagement/:itemId/users", async (c) => {
    const itemId = z.string().uuid().safeParse(c.req.param("itemId"));
    if (!itemId.success) {
      return c.json({ error: "Invalid learning content id" }, 400);
    }
    try {
      const range = resolveLearningEngagementRange(c.req.query("from"), c.req.query("to"));
      const result = await getLearningEngagementUsers(itemId.data, range.from, range.toExclusive);
      return result ? c.json(result) : c.json({ error: "Learning content not found" }, 404);
    } catch {
      return c.json({ error: "Invalid learning engagement date range" }, 400);
    }
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
    const pollRecords = await db.query.clubPolls.findMany({
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      with: {
        message: { with: { topic: true, user: true } },
        options: true,
        votes: true
      }
    });
    const now = new Date();
    const pollSummaryInput = pollRecords.map((poll) => ({
      id: poll.id,
      closed: Boolean(poll.closedAt || (poll.closesAt && poll.closesAt <= now)),
      voterIds: Array.from(new Set(poll.votes.map((vote) => vote.userId))),
      votesCount: poll.votes.length
    }));
    const pollSummary = summarizePollStatistics(pollSummaryInput, usersCountRow?.value ?? 0);
    const acquisitionByUserId = await getClientAcquisitionSummaries(recentUsers.map((user) => user.id));
    const statsUsers = await Promise.all(recentUsers.map((user) => buildStatsUser(user, totalItems, acquisitionByUserId)));

    return c.json({
      totalUsers: usersCountRow?.value ?? statsUsers.length,
      activeUsers: statsUsers.filter((user) => user.membershipStatus === "active").length,
      completedItems: statsUsers.reduce((sum, user) => sum + user.completedItems, 0),
      totalItems,
      users: statsUsers,
      pollStats: {
        ...pollSummary,
        polls: pollRecords.map((poll) => {
          const voterIds = new Set(poll.votes.map((vote) => vote.userId));
          return {
            id: poll.id,
            question: poll.question,
            topicTitle: poll.message.topic.title,
            isAnonymous: poll.isAnonymous,
            closed: Boolean(poll.closedAt || (poll.closesAt && poll.closesAt <= now)),
            author: buildMessageAuthor(poll.message.user),
            startedAt: poll.createdAt.toISOString(),
            endedAt: resolvePollEndedAt(poll),
            totalVoters: voterIds.size,
            options: [...poll.options].sort((a, b) => a.sortOrder - b.sortOrder).map((option) => {
              const votesCount = poll.votes.filter((vote) => vote.optionId === option.id).length;
              return { id: option.id, text: option.text, votesCount, percent: voterIds.size ? Math.round((votesCount / voterIds.size) * 100) : 0 };
            })
          };
        })
      },
      communityMessages: communityMessages.map((message) => ({
        id: message.id,
        topicId: message.topicId,
        topicTitle: message.topic.title,
        isSystem: message.isSystem,
        status: message.status,
        author: buildMessageAuthor(message.user),
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
  .patch("/stats/users/:telegramId/display-name", async (c) => {
    const permissionError = await rejectIfNotOwner(c, "users");
    if (permissionError) return permissionError;
    const user = await db.query.users.findFirst({ where: eq(users.telegramId, c.req.param("telegramId")) });
    if (!user) return c.json({ error: "User not found" }, 404);
    const raw = (await c.req.json().catch(() => null)) as { displayName?: unknown } | null;
    if (typeof raw?.displayName !== "string" || !isValidDisplayName(raw.displayName)) return c.json({ error: "Invalid display name" }, 400);
    const displayName = normalizeDisplayName(raw.displayName);
    try {
      const [updatedUser] = await db.update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, user.id)).returning();
      if (!updatedUser) return c.json({ error: "Unable to update display name" }, 500);
      await recordAdminAction(c, {
        action: "client.display_name.updated",
        entityType: "user",
        entityId: user.id,
        targetUserId: user.id,
        targetTelegramId: user.telegramId,
        summary: `Изменил ник клиента на ${displayName}`,
        metadata: { previousDisplayName: user.displayName, displayName }
      });
      return c.json(await buildStatsUser(updatedUser, await getPublishedItemsCount()));
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") return c.json({ error: "Display name is already taken" }, 409);
      throw error;
    }
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
        author: buildMessageAuthor(comment.user),
        sourceTitle: comment.item.title,
        createdAt: comment.createdAt.toISOString()
      })),
      ...messages.map((message) => ({
        id: message.id,
        kind: "chat_message" as const,
        body: message.body,
        status: message.status,
        author: buildMessageAuthor(message.user),
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
  .post("/learning/categories/reorder", async (c) => {
    const body = learningReorderPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid category reorder payload" }, 400);
    }

    const categories = await db.query.contentCategories.findMany({
      orderBy: [asc(contentCategories.sortOrder), asc(contentCategories.createdAt)]
    });
    const moduleIds = categories.filter((category) => isModuleCategoryDescription(category.description)).map((category) => category.id);
    const validation = validateReorderIds(body.data.ids, moduleIds);
    if (!validation.ok) {
      return c.json({ error: "Invalid category order" }, 400);
    }

    await db.transaction(async (tx) => {
      for (const update of validation.updates) {
        await tx
          .update(contentCategories)
          .set({
            sortOrder: update.sortOrder,
            updatedAt: new Date()
          })
          .where(eq(contentCategories.id, update.id));
      }
    });

    await recordAdminAction(c, {
      action: "learning.category.reordered",
      entityType: "learning_category",
      summary: "Изменил порядок модулей",
      metadata: {
        ids: body.data.ids
      }
    });

    return c.json({ ok: true });
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
  .post("/learning/materials/reorder", async (c) => {
    const body = learningMaterialReorderPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid material reorder payload" }, 400);
    }

    const category = await db.query.contentCategories.findFirst({
      where: eq(contentCategories.id, body.data.categoryId)
    });
    if (!category || !isModuleCategoryDescription(category.description)) {
      return c.json({ error: "Category not found" }, 404);
    }

    const materials = await db.query.contentItems.findMany({
      where: and(eq(contentItems.categoryId, body.data.categoryId), isNull(contentItems.archivedUntil)),
      orderBy: [asc(contentItems.sortOrder), desc(contentItems.createdAt)]
    });
    const validation = validateReorderIds(
      body.data.ids,
      materials.map((material) => material.id)
    );
    if (!validation.ok) {
      return c.json({ error: "Invalid material order" }, 400);
    }

    await db.transaction(async (tx) => {
      for (const update of validation.updates) {
        await tx
          .update(contentItems)
          .set({
            sortOrder: update.sortOrder,
            updatedAt: new Date()
          })
          .where(eq(contentItems.id, update.id));
      }
    });

    await recordAdminAction(c, {
      action: "learning.material.reordered",
      entityType: "learning_material",
      summary: `Изменил порядок уроков в модуле "${category.title}"`,
      metadata: {
        categoryId: body.data.categoryId,
        ids: body.data.ids
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
    const partSizeBytes = maxMultipartPartSizeBytes;
    const partsCount = Math.max(1, Math.ceil(sizeBytes / partSizeBytes));
    const upload = await createMultipartUpload({ key: objectKey, contentType, partsCount });

    return c.json({
      objectKey: upload.key,
      uploadId: upload.uploadId,
      contentType,
      sizeBytes,
      partSizeBytes,
      parts: upload.parts.map((part) => {
        const uploadUrl = new URL("/api/admin/learning/materials/uploads/multipart/part", env.WEB_ORIGIN);
        uploadUrl.searchParams.set("objectKey", upload.key);
        uploadUrl.searchParams.set("uploadId", upload.uploadId);
        uploadUrl.searchParams.set("partNumber", String(part.partNumber));
        return { partNumber: part.partNumber, uploadUrl: uploadUrl.toString() };
      }),
      expiresAt: upload.expiresAt.toISOString()
    });
  })
  .put("/learning/materials/uploads/multipart/part", async (c) => {
    const query = learningMultipartPartQuerySchema.safeParse({
      objectKey: c.req.query("objectKey"),
      uploadId: c.req.query("uploadId"),
      partNumber: c.req.query("partNumber")
    });
    if (!query.success || classifyS3ObjectKey(query.data.objectKey).category !== "learning") {
      return c.json({ error: "Invalid multipart upload part" }, 400);
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await c.req.arrayBuffer());
    } catch (error) {
      recordServerError({
        error,
        title: "Соединение прервано при получении части файла урока",
        method: c.req.method,
        path: c.req.path,
        status: 408
      });
      c.header("Retry-After", "1");
      return c.json({
        error: "Upload connection closed",
        code: "UPLOAD_CONNECTION_CLOSED",
        detail: "Соединение закрылось до завершения передачи части файла."
      }, 408);
    }
    if (!isValidMultipartPartSize(bytes.byteLength)) {
      return c.json({ error: "Invalid multipart upload part size" }, 400);
    }

    try {
      const uploaded = await uploadMultipartPart({
        key: query.data.objectKey,
        uploadId: query.data.uploadId,
        partNumber: query.data.partNumber,
        body: bytes
      });
      c.header("ETag", uploaded.etag);
      return c.body(null, 204);
    } catch (error) {
      recordServerError({
        error,
        title: "Не удалось загрузить часть файла урока",
        method: c.req.method,
        path: c.req.path,
        status: 503
      });
      c.header("Retry-After", "1");
      return c.json({
        error: "Storage temporarily unavailable",
        code: "STORAGE_UNAVAILABLE",
        detail: "Хранилище временно не приняло часть файла."
      }, 503);
    }
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
  .get("/learning/materials/operations/:key", async (c) => {
    const key = idempotencyKeySchema.safeParse(c.req.param("key"));
    if (!key.success) {
      return c.json({ error: "Invalid idempotency key" }, 400);
    }

    const operation = await db.query.idempotencyOperations.findFirst({
      where: and(
        eq(idempotencyOperations.actorTelegramId, c.get("telegramUser").id),
        eq(idempotencyOperations.scope, learningMaterialCreateScope),
        eq(idempotencyOperations.idempotencyKey, key.data),
        gt(idempotencyOperations.expiresAt, new Date())
      )
    });
    if (!operation) {
      return c.json({ error: "Operation not found" }, 404);
    }
    if (operation.status === "processing") {
      return c.json({ status: "processing" as const }, 202);
    }
    if (operation.status === "failed") {
      return c.json({ status: "failed" as const, errorCode: operation.errorCode }, 200);
    }

    const material = operation.resourceId
      ? await db.query.contentItems.findFirst({ where: eq(contentItems.id, operation.resourceId) })
      : null;
    return c.json({
      status: "succeeded" as const,
      material: material ? await serializeAdminMaterial(material) : null
    });
  })
  .post("/learning/materials/direct", async (c) => {
    const body = directLearningMaterialPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid material payload" }, 400);
    }
    const rawIdempotencyKey = c.req.header("Idempotency-Key");
    const parsedIdempotencyKey = rawIdempotencyKey ? idempotencyKeySchema.safeParse(rawIdempotencyKey) : null;
    if (parsedIdempotencyKey && !parsedIdempotencyKey.success) {
      return c.json({ error: "Invalid idempotency key" }, 400);
    }

    const { categoryId, kind, title, cardLayout, coverMode, isPublished } = body.data;
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

    let claimedOperationId: string | null = null;
    if (parsedIdempotencyKey?.success) {
      const actorTelegramId = c.get("telegramUser").id;
      const idempotencyKey = parsedIdempotencyKey.data;
      const requestFingerprint = createRequestFingerprint(body.data);
      const operationWhere = and(
        eq(idempotencyOperations.actorTelegramId, actorTelegramId),
        eq(idempotencyOperations.scope, learningMaterialCreateScope),
        eq(idempotencyOperations.idempotencyKey, idempotencyKey)
      );

      await db.delete(idempotencyOperations).where(and(operationWhere, lt(idempotencyOperations.expiresAt, new Date())));
      const [claimed] = await db
        .insert(idempotencyOperations)
        .values({
          actorTelegramId,
          scope: learningMaterialCreateScope,
          idempotencyKey,
          requestFingerprint,
          status: "processing",
          expiresAt: new Date(Date.now() + idempotencyOperationTtlMs)
        })
        .onConflictDoNothing()
        .returning({ id: idempotencyOperations.id });

      if (claimed) {
        claimedOperationId = claimed.id;
      } else {
        const existing = await db.query.idempotencyOperations.findFirst({ where: operationWhere });
        const decision = decideLearningSaveClaim(existing ?? null, requestFingerprint);
        if (decision.kind === "conflict") {
          return c.json({ error: "Idempotency key was reused", code: "IDEMPOTENCY_KEY_REUSED" }, 409);
        }
        if (decision.kind === "processing") {
          return c.json({ error: "Operation is still processing", code: "IDEMPOTENCY_IN_PROGRESS" }, 409);
        }
        if (decision.kind === "failed") {
          return c.json({ error: "Previous operation failed", code: decision.errorCode ?? "IDEMPOTENCY_PREVIOUSLY_FAILED" }, 409);
        }
        if (decision.kind === "succeeded") {
          const existingMaterial = decision.resourceId
            ? await db.query.contentItems.findFirst({ where: eq(contentItems.id, decision.resourceId) })
            : null;
          if (!existingMaterial) {
            return c.json({ error: "Saved material is no longer available", code: "IDEMPOTENCY_RESOURCE_GONE" }, 410);
          }
          return c.json({ ok: true, material: await serializeAdminMaterial(existingMaterial) });
        }

        return c.json({ error: "Unable to claim idempotency key" }, 500);
      }
    }

    const now = new Date();
    const sortOrder = await getNextMaterialSortOrder(categoryId);
    let material: typeof contentItems.$inferSelect | undefined;
    try {
      [material] = await db
        .insert(contentItems)
        .values({
          categoryId,
          kind,
          title,
          summary,
          body: materialBody,
          cardLayout,
          coverMode,
          mediaUrl,
          mediaObjectKey,
          thumbnailObjectKey,
          thumbnailContentType,
          thumbnailSizeBytes,
          mediaContentType,
          mediaSizeBytes,
          sortOrder,
          isPublished,
          publishedAt: isPublished ? now : null,
          archivedUntil: null,
          createdAt: now,
          updatedAt: now
        })
        .returning();
    } catch (error) {
      if (claimedOperationId) {
        await db
          .update(idempotencyOperations)
          .set({ status: "failed", errorCode: "MATERIAL_CREATE_FAILED", updatedAt: new Date() })
          .where(eq(idempotencyOperations.id, claimedOperationId));
      }
      throw error;
    }

    if (!material) {
      if (claimedOperationId) {
        await db
          .update(idempotencyOperations)
          .set({ status: "failed", errorCode: "MATERIAL_CREATE_FAILED", updatedAt: new Date() })
          .where(eq(idempotencyOperations.id, claimedOperationId));
      }
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
      if (claimedOperationId) {
        await db
          .update(idempotencyOperations)
          .set({ status: "failed", errorCode: "INVALID_LESSON_MATERIALS", updatedAt: new Date() })
          .where(eq(idempotencyOperations.id, claimedOperationId));
      }
      return c.json({ error: "Invalid lesson materials" }, 400);
    }

    if (claimedOperationId) {
      await db
        .update(idempotencyOperations)
        .set({ status: "succeeded", resourceId: material.id, errorCode: null, updatedAt: new Date() })
        .where(eq(idempotencyOperations.id, claimedOperationId));
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
    const rawCoverMode = getFormValue(form, "coverMode");
    const coverMode = rawCoverMode === "custom" || rawCoverMode === "first_material" ? rawCoverMode : "default";
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
    const sortOrder = await getNextMaterialSortOrder(categoryId);
    const [material] = await db
      .insert(contentItems)
      .values({
        categoryId,
        kind,
        title,
        summary,
        body,
        cardLayout,
        coverMode,
        mediaObjectKey,
        thumbnailObjectKey,
        thumbnailContentType,
        thumbnailSizeBytes,
        mediaContentType,
        mediaSizeBytes,
        sortOrder,
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

    const { categoryId, kind, title, cardLayout, coverMode, isPublished, removeThumbnail } = body.data;
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
        coverMode,
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
    const rawCoverMode = getFormValue(form, "coverMode");
    const coverMode = rawCoverMode === "custom" || rawCoverMode === "first_material" ? rawCoverMode : "default";
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
        coverMode,
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
        publishCommunityChange(message.topicId);
        return c.json({ ok: true });
      }

      await db
        .update(clubChatMessages)
        .set({
          ...values,
          purgeAt:
            body.data.status === "deleted"
              ? getMessagePurgeAt("message", role, values.moderatedAt)
              : null,
          ...(body.data.status === "visible"
            ? {}
            : {
                pinnedAt: null,
                pinnedByUserId: null
              })
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
      publishCommunityChange(message.topicId);
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
      return c.json({ error: "User email or id is invalid" }, 400);
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
      return c.json({ error: "User email or id is invalid" }, 400);
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
