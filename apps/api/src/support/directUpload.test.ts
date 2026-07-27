import { describe, expect, it } from "vitest";
import { supportUploadedObjectSchema, supportUploadIntentSchema } from "@club/shared";
import {
  buildSupportPendingObjectKey,
  createSupportUploadIntent,
  verifySupportUploadedObjects,
  validateSupportUploadStreamRequest,
  validateSupportUploadedObject
} from "./directUpload";

const me = "11111111-1111-4111-8111-111111111111";
const token = "22222222-2222-4222-8222-222222222222";

describe("support direct uploads", () => {
  it("accepts supported images and videos up to 50 MiB", () => {
    expect(supportUploadIntentSchema.safeParse({ fileName: "screen.png", contentType: "image/png", sizeBytes: 50 * 1024 * 1024 }).success).toBe(true);
    expect(supportUploadIntentSchema.safeParse({ fileName: "clip.mp4", contentType: "video/mp4", sizeBytes: 50 * 1024 * 1024 }).success).toBe(true);
    expect(supportUploadIntentSchema.safeParse({ fileName: "large.mp4", contentType: "video/mp4", sizeBytes: 50 * 1024 * 1024 + 1 }).success).toBe(false);
    expect(supportUploadIntentSchema.safeParse({ fileName: "script.html", contentType: "text/html", sizeBytes: 10 }).success).toBe(false);
  });

  it("builds a pending key scoped to the authenticated user", () => {
    expect(buildSupportPendingObjectKey({ userId: me, uploadToken: token, fileName: "My Clip.MP4", now: new Date("2026-07-27T10:00:00Z") }))
      .toBe(`support/pending/${me}/2026-07-27/${token}-my-clip.mp4`);
  });

  it("verifies ownership and exact S3 metadata", () => {
    const objectKey = `support/pending/${me}/2026-07-27/${token}-clip.mp4`;
    const uploaded = supportUploadedObjectSchema.parse({ objectKey, uploadToken: token, fileName: "clip.mp4", contentType: "video/mp4", sizeBytes: 1024 });

    expect(validateSupportUploadedObject({ uploaded, userId: me, metadata: { key: objectKey, contentType: "video/mp4", sizeBytes: 1024 } })).toEqual({
      ok: true,
      value: { objectKey, fileName: "clip.mp4", contentType: "video/mp4", sizeBytes: 1024, kind: "video" }
    });
    expect(validateSupportUploadedObject({ uploaded, userId: "33333333-3333-4333-8333-333333333333", metadata: { key: objectKey, contentType: "video/mp4", sizeBytes: 1024 } })).toEqual({ ok: false, error: "foreign_object" });
    expect(validateSupportUploadedObject({ uploaded, userId: me, metadata: { key: objectKey, contentType: "video/mp4", sizeBytes: 0 } })).toEqual({ ok: false, error: "metadata_mismatch" });
    expect(validateSupportUploadedObject({ uploaded, userId: me, metadata: { key: objectKey, contentType: "video/mp4", sizeBytes: 2048 } })).toEqual({ ok: false, error: "metadata_mismatch" });
  });

  it("creates a short-lived signed upload intent for an API-generated key", async () => {
    const result = createSupportUploadIntent({
      userId: me,
      input: { fileName: "clip.mp4", contentType: "video/mp4", sizeBytes: 1024 },
      uploadToken: token,
      now: new Date("2026-07-27T10:00:00Z")
    });

    expect(result).toEqual({
      uploadUrl: `/support/uploads/${token}?objectKey=support%2Fpending%2F${me}%2F2026-07-27%2F${token}-clip.mp4&fileName=clip.mp4&contentType=video%2Fmp4&sizeBytes=1024&expiresAt=2026-07-27T10%3A10%3A00.000Z`,
      objectKey: `support/pending/${me}/2026-07-27/${token}-clip.mp4`,
      uploadToken: token,
      contentType: "video/mp4",
      sizeBytes: 1024,
      expiresAt: "2026-07-27T10:10:00.000Z"
    });
  });

  it("rejects a consumed object before message creation", async () => {
    const objectKey = `support/pending/${me}/2026-07-27/${token}-clip.mp4`;
    const uploaded = supportUploadedObjectSchema.parse({ objectKey, uploadToken: token, fileName: "clip.mp4", contentType: "video/mp4", sizeBytes: 1024 });

    await expect(verifySupportUploadedObjects({
      uploaded: [uploaded],
      userId: me,
      getMetadata: async () => ({ key: objectKey, contentType: "video/mp4", sizeBytes: 1024 }),
      isConsumed: async () => true
    })).rejects.toThrow("support_object_already_consumed");
  });

  it("accepts only an owned stream with the declared length and type", () => {
    const objectKey = `support/pending/${me}/2026-07-27/${token}-clip.mp4`;
    const uploaded = supportUploadedObjectSchema.parse({ objectKey, uploadToken: token, fileName: "clip.mp4", contentType: "video/mp4", sizeBytes: 1024 });

    const base = { uploaded, userId: me, contentLength: 1024, contentType: "video/mp4", hasBody: true, expiresAt: new Date("2026-07-27T10:10:00Z"), now: new Date("2026-07-27T10:05:00Z") };
    expect(validateSupportUploadStreamRequest(base)).toEqual({ ok: true });
    expect(validateSupportUploadStreamRequest({ ...base, contentLength: 2048 })).toEqual({ ok: false, error: "content_length_mismatch" });
    expect(validateSupportUploadStreamRequest({ ...base, contentType: "application/octet-stream" })).toEqual({ ok: false, error: "content_type_mismatch" });
    expect(validateSupportUploadStreamRequest({ ...base, userId: "33333333-3333-4333-8333-333333333333" })).toEqual({ ok: false, error: "foreign_object" });
    expect(validateSupportUploadStreamRequest({ ...base, now: new Date("2026-07-27T10:10:01Z") })).toEqual({ ok: false, error: "expired" });
  });
});
