type UploadManifest = {
  userId: string;
  uploadToken: string;
  kind: string;
  status: string;
  finalObjectKey: string | null;
  quarantineObjectKey: string | null;
  attachmentId?: string | null;
};

export function deriveCommunityUploadMessage(manifests: Array<Pick<UploadManifest, "kind">>) {
  if (manifests.length < 1 || manifests.length > 10) return { error: "upload_kind_mismatch" } as const;
  const kinds = new Set(manifests.map((manifest) => manifest.kind));
  if (kinds.size !== 1) return { error: "upload_kind_mismatch" } as const;
  const kind = manifests[0]?.kind;
  if (kind === "image") {
    return {
      kind: "images" as const,
      body: manifests.length === 1 ? "Изображение" : `${manifests.length} изображения`
    };
  }
  if (manifests.length !== 1) return { error: "upload_kind_mismatch" } as const;
  if (kind === "voice") return { kind: "voice" as const, body: "Голосовое сообщение" };
  if (kind === "video") return { kind: "video" as const, body: "Видео" };
  if (kind === "document") return { kind: "document" as const, body: "Документ" };
  return { error: "upload_kind_mismatch" } as const;
}

export function isExactCommunityUploadReplayBatch(
  manifests: Array<Pick<UploadManifest, "attachmentId">>,
  messageAttachments: Array<{ id: string }>
) {
  const requestedIds = manifests.map((manifest) => manifest.attachmentId).filter((id): id is string => Boolean(id));
  if (requestedIds.length !== manifests.length || new Set(requestedIds).size !== requestedIds.length) return false;
  const existingIds = new Set(messageAttachments.map((attachment) => attachment.id));
  return existingIds.size === requestedIds.length && requestedIds.every((id) => existingIds.has(id));
}

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
    } else if (["image", "voice"].includes(manifest.kind)) {
      if (!(["processing", "normalizing", "ready"].includes(manifest.status)) || !(manifest.finalObjectKey ?? manifest.quarantineObjectKey)) {
        return { ok: false, error: "upload_not_ready" } as const;
      }
    } else if (manifest.status !== "ready" || !manifest.finalObjectKey) {
      return { ok: false, error: "upload_not_ready" } as const;
    }
  }
  return { ok: true } as const;
}
