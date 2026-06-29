import type { AdminMailing, MailingFilters, MailingStatus } from "@club/shared";
import { adminMailings } from "../db/schema";
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

export async function serializeAdminMailing(mailing: typeof adminMailings.$inferSelect): Promise<AdminMailing> {
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
