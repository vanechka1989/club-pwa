import type { AdminActionLog } from "@club/shared";

function normalizeAuditText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function distinctAuditDetails(title: string, summary: string) {
  const details = summary.trim();
  if (!details || normalizeAuditText(details) === normalizeAuditText(title)) {
    return null;
  }
  return details;
}

type S3DeletionSource = {
  categoryLabel: string;
  fileKind: string;
  sourceKind: "learning" | "lesson_material" | "community" | "support" | "mailing" | "notification" | "other";
  sourceTitle: string | null;
  parentTitle: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readS3DeletionSource(value: unknown): S3DeletionSource | null {
  if (!isRecord(value)) return null;
  const supportedKinds = ["learning", "lesson_material", "community", "support", "mailing", "notification", "other"];
  if (
    typeof value.categoryLabel !== "string"
    || typeof value.fileKind !== "string"
    || typeof value.sourceKind !== "string"
    || !supportedKinds.includes(value.sourceKind)
    || !(typeof value.sourceTitle === "string" || value.sourceTitle === null)
    || !(typeof value.parentTitle === "string" || value.parentTitle === null)
  ) {
    return null;
  }

  return value as S3DeletionSource;
}

function lowerFirst(value: string) {
  return value ? `${value[0]?.toLocaleLowerCase("ru-RU")}${value.slice(1)}` : value;
}

function formatS3DeletionSource(source: S3DeletionSource) {
  if (source.sourceKind === "lesson_material" && source.parentTitle && source.sourceTitle) {
    return `Источник: урок «${source.parentTitle}» · карточка «${source.sourceTitle}»`;
  }
  if (source.sourceKind === "learning" && source.sourceTitle) {
    return `Источник: урок «${source.sourceTitle}» · ${lowerFirst(source.fileKind)}`;
  }
  if (source.sourceKind === "community" && source.sourceTitle) {
    return `Источник: общение · тема «${source.sourceTitle}» · ${lowerFirst(source.fileKind)}`;
  }
  if (source.sourceKind === "support" && source.sourceTitle) {
    return `Источник: поддержка · обращение «${source.sourceTitle}»`;
  }
  if (source.sourceKind === "mailing" && source.sourceTitle) {
    return `Источник: рассылка «${source.sourceTitle}»`;
  }
  if (source.sourceKind === "notification" && source.sourceTitle) {
    return `Источник: уведомление «${source.sourceTitle}»`;
  }
  return `Источник: ${source.categoryLabel} · ${source.fileKind}`;
}

export function getS3DeletionPresentation(
  log: Pick<AdminActionLog, "action" | "entityId" | "metadata">
): { source: string; key: string } | null {
  if (log.action !== "storage.s3.object.deleted") return null;
  const source = readS3DeletionSource(log.metadata.source);
  const metadataKey = log.metadata.key;
  const key = typeof metadataKey === "string" && metadataKey.trim()
    ? metadataKey.trim()
    : log.entityId?.trim();
  if (!source || !key) return null;
  return { source: formatS3DeletionSource(source), key };
}
