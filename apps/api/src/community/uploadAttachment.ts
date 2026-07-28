type UploadManifest = {
  userId: string;
  uploadToken: string;
  kind: string;
  status: string;
  finalObjectKey: string | null;
  quarantineObjectKey: string | null;
  attachmentId?: string | null;
};

export function validateCommunityUploadAttachmentBatch({
  userId,
  existingImageCount,
  manifests
}: {
  userId: string;
  existingImageCount: number;
  manifests: UploadManifest[];
}) {
  if (manifests.some((manifest) => manifest.userId !== userId)) return { ok: false, error: "foreign_upload" } as const;
  const tokens = new Set(manifests.map((manifest) => manifest.uploadToken));
  if (tokens.size !== manifests.length) return { ok: false, error: "duplicate_upload" } as const;
  const imageCount = manifests.filter((manifest) => manifest.kind === "image" && !manifest.attachmentId).length;
  if (existingImageCount + imageCount > 10) return { ok: false, error: "too_many_images" } as const;
  for (const manifest of manifests) {
    if (manifest.kind === "document") {
      if (!["pending", "scanning", "failed", "cleanup_pending", "ready"].includes(manifest.status) || !(manifest.finalObjectKey ?? manifest.quarantineObjectKey)) {
        return { ok: false, error: "upload_not_ready" } as const;
      }
    } else if (manifest.status !== "ready" || !manifest.finalObjectKey) {
      return { ok: false, error: "upload_not_ready" } as const;
    }
  }
  return { ok: true } as const;
}
