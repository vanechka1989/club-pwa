import { classifyS3ObjectKey, type S3ObjectCategory } from "./s3Object";

export type S3ObjectSourceKind =
  | "learning"
  | "lesson_material"
  | "community"
  | "support"
  | "mailing"
  | "notification"
  | "other";

export type S3ObjectSourceSnapshot = {
  category: S3ObjectCategory;
  categoryLabel: string;
  fileKind: string;
  sourceKind: S3ObjectSourceKind;
  sourceTitle: string | null;
  parentTitle: string | null;
  resolved: boolean;
};

const fallbackSourceKinds: Record<S3ObjectCategory, S3ObjectSourceKind> = {
  learning: "learning",
  support: "support",
  mailings: "mailing",
  notifications: "notification",
  community: "community",
  other: "other"
};

export function createFallbackS3ObjectSource(key: string): S3ObjectSourceSnapshot {
  const classification = classifyS3ObjectKey(key);

  return {
    ...classification,
    sourceKind: fallbackSourceKinds[classification.category],
    sourceTitle: null,
    parentTitle: null,
    resolved: false
  };
}
