import type { AdminMailing, MailingFilters, MailingStatus } from "@club/shared";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { adminMailings, users } from "../db/schema";
import { getObjectReadUrl } from "../storage/s3";
import { formatMailingDuration } from "./estimate";

const defaultFilters: MailingFilters = {
  accessStatus: "active",
  accessType: "all",
  excludeAdmins: true,
  excludeRestricted: true
};

export function normalizeMailingFilters(value: unknown): MailingFilters {
  if (!value || typeof value !== "object") {
    return defaultFilters;
  }

  const filters = value as Partial<MailingFilters>;
  return {
    accessStatus:
      filters.accessStatus === "all" || filters.accessStatus === "active" || filters.accessStatus === "inactive"
        ? filters.accessStatus
        : defaultFilters.accessStatus,
    accessType:
      filters.accessType === "all" ||
      filters.accessType === "manual" ||
      filters.accessType === "one_time" ||
      filters.accessType === "recurrent" ||
      filters.accessType === "none"
        ? filters.accessType
        : defaultFilters.accessType,
    excludeAdmins: filters.excludeAdmins ?? defaultFilters.excludeAdmins,
    excludeRestricted: filters.excludeRestricted ?? defaultFilters.excludeRestricted
  };
}

type AdminMailingRow = typeof adminMailings.$inferSelect & {
  createdBy?: typeof users.$inferSelect | null;
};

async function getMailingCreator(mailing: AdminMailingRow) {
  if (mailing.createdBy) {
    return mailing.createdBy;
  }

  if (!mailing.createdByUserId) {
    return null;
  }

  return (
    (await db.query.users.findFirst({
      where: eq(users.id, mailing.createdByUserId)
    })) ?? null
  );
}

export async function serializeAdminMailing(mailing: AdminMailingRow): Promise<AdminMailing> {
  const creator = await getMailingCreator(mailing);

  return {
    id: mailing.id,
    title: mailing.title,
    body: mailing.body,
    bodyHtml: mailing.bodyHtml,
    channel: mailing.channel as AdminMailing["channel"],
    filters: normalizeMailingFilters(mailing.filters),
    status: mailing.status as MailingStatus,
    scheduledAt: mailing.scheduledAt?.toISOString() ?? null,
    startedAt: mailing.startedAt?.toISOString() ?? null,
    completedAt: mailing.completedAt?.toISOString() ?? null,
    createdBy: creator
      ? {
          id: creator.id,
          telegramId: creator.telegramId,
          firstName: creator.firstName,
          username: creator.username,
          photoUrl: creator.photoUrl,
          avatarPositionX: creator.avatarPositionX ?? 50,
          avatarPositionY: creator.avatarPositionY ?? 50,
          avatarScale: (creator.avatarScale ?? 100) / 100
        }
      : null,
    targetCount: mailing.targetCount,
    sentCount: mailing.sentCount,
    failedCount: mailing.failedCount,
    skippedCount: mailing.skippedCount,
    estimatedSeconds: mailing.estimatedSeconds,
    estimatedLabel: formatMailingDuration(mailing.estimatedSeconds),
    attachment:
      mailing.attachmentKind &&
      mailing.attachmentFileName &&
      mailing.attachmentObjectKey &&
      mailing.attachmentContentType
        ? {
            kind: mailing.attachmentKind as "photo" | "video" | "document",
            fileName: mailing.attachmentFileName,
            url: await getObjectReadUrl(mailing.attachmentObjectKey),
            contentType: mailing.attachmentContentType,
            sizeBytes: mailing.attachmentSizeBytes ?? 0
          }
        : null,
    createdAt: mailing.createdAt.toISOString(),
    updatedAt: mailing.updatedAt.toISOString()
  };
}
