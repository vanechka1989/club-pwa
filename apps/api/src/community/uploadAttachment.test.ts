import { describe, expect, it } from "vitest";
import { deriveCommunityUploadMessage, validateCommunityUploadAttachmentBatch } from "./uploadAttachment";

const userId = "11111111-1111-4111-8111-111111111111";

const image = (index: number, overrides: Record<string, unknown> = {}) => ({
  id: `manifest-${index}`,
  userId,
  uploadToken: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  kind: "image",
  status: "ready",
  finalObjectKey: `community/final/u/${index}.webp`,
  quarantineObjectKey: null,
  attachmentId: null,
  ...overrides
});

describe("transactional community upload attachment policy", () => {
  it("derives one exact message kind from the upload batch", () => {
    expect(deriveCommunityUploadMessage([image(1)])).toEqual({ kind: "images", body: "Изображение" });
    expect(deriveCommunityUploadMessage([image(1), image(2)])).toEqual({ kind: "images", body: "2 изображения" });
    expect(deriveCommunityUploadMessage([image(1, { kind: "voice" })])).toEqual({ kind: "voice", body: "Голосовое сообщение" });
    expect(deriveCommunityUploadMessage([image(1, { kind: "video" })])).toEqual({ kind: "video", body: "Видео" });
    expect(deriveCommunityUploadMessage([image(1, { kind: "document" })])).toEqual({ kind: "document", body: "Документ" });
  });

  it("rejects mixed media and singleton-kind cardinality violations", () => {
    expect(deriveCommunityUploadMessage([image(1), image(2, { kind: "video" })])).toEqual({ error: "upload_kind_mismatch" });
    expect(deriveCommunityUploadMessage([image(1, { kind: "voice" }), image(2, { kind: "voice" })])).toEqual({ error: "upload_kind_mismatch" });
  });

  it("accepts ten images but rejects eleven across existing and newly attached media", () => {
    expect(validateCommunityUploadAttachmentBatch({ userId, existingImageCount: 2, manifests: Array.from({ length: 8 }, (_, index) => image(index)) })).toEqual({ ok: true });
    expect(validateCommunityUploadAttachmentBatch({ userId, existingImageCount: 2, manifests: Array.from({ length: 9 }, (_, index) => image(index)) })).toEqual({ ok: false, error: "too_many_images" });
    expect(validateCommunityUploadAttachmentBatch({ userId, existingImageCount: 10, manifests: [image(10, { attachmentId: "existing-attachment" })] })).toEqual({ ok: true });
  });

  it("rejects foreign ownership, duplicate tokens, and non-ready final media", () => {
    expect(validateCommunityUploadAttachmentBatch({ userId, existingImageCount: 0, manifests: [image(1, { userId: "other" })] })).toEqual({ ok: false, error: "foreign_upload" });
    expect(validateCommunityUploadAttachmentBatch({ userId, existingImageCount: 0, manifests: [image(1), image(2, { uploadToken: image(1).uploadToken })] })).toEqual({ ok: false, error: "duplicate_upload" });
    expect(validateCommunityUploadAttachmentBatch({ userId, existingImageCount: 0, manifests: [image(1, { status: "uploading", finalObjectKey: null, quarantineObjectKey: "community/quarantine/u/1.webp" })] })).toEqual({ ok: false, error: "upload_not_ready" });
  });

  it("allows processing media and quarantined documents to attach before worker work", () => {
    expect(validateCommunityUploadAttachmentBatch({
      userId,
      existingImageCount: 0,
      manifests: [image(1, {
        status: "processing",
        finalObjectKey: null,
        quarantineObjectKey: "community/quarantine/u/photo.png"
      })]
    })).toEqual({ ok: true });
    expect(validateCommunityUploadAttachmentBatch({
      userId,
      existingImageCount: 0,
      manifests: [image(1, {
        kind: "document",
        status: "pending",
        finalObjectKey: null,
        quarantineObjectKey: "community/quarantine/u/guide.pdf"
      })]
    })).toEqual({ ok: true });
  });
});
