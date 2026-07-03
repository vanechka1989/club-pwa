import { describe, expect, it } from "vitest";
import {
  buildSupportAttachmentObjectKey,
  getSupportAttachmentExpiresAt,
  getSupportAttachmentLimitError,
  getSupportAttachmentUploadContentType,
  supportAttachmentLimits
} from "./mediaUpload";

describe("support attachment uploads", () => {
  it("accepts only image and video files", () => {
    expect(getSupportAttachmentUploadContentType("image/png", "screen.png")).toBe("image/png");
    expect(getSupportAttachmentUploadContentType("video/mp4", "recording.mp4")).toBe("video/mp4");
    expect(getSupportAttachmentUploadContentType("application/octet-stream", "photo.jpg")).toBe("image/jpeg");
    expect(getSupportAttachmentUploadContentType("application/pdf", "doc.pdf")).toBeNull();
  });

  it("stores attachments under the support prefix", () => {
    expect(
      buildSupportAttachmentObjectKey({
        fileName: "Payment Screen.PNG",
        id: "upload-id",
        now: new Date("2026-06-27T01:00:00.000Z")
      })
    ).toBe("support/2026-06-27/upload-id-payment-screen.png");
  });

  it("expires support attachments after seven days", () => {
    expect(getSupportAttachmentExpiresAt(new Date("2026-06-27T01:00:00.000Z")).toISOString()).toBe(
      "2026-07-04T01:00:00.000Z"
    );
  });

  it("rejects too many or too large support attachments before reading them into memory", () => {
    expect(getSupportAttachmentLimitError(Array.from({ length: supportAttachmentLimits.maxFiles + 1 }, () => ({ size: 1 })))).toBe(
      "too_many_files"
    );
    expect(getSupportAttachmentLimitError([{ size: supportAttachmentLimits.maxFileBytes + 1 }])).toBe("file_too_large");
    expect(
      getSupportAttachmentLimitError([
        { size: supportAttachmentLimits.maxTotalBytes / 3 + 1 },
        { size: supportAttachmentLimits.maxTotalBytes / 3 + 1 },
        { size: supportAttachmentLimits.maxTotalBytes / 3 + 1 }
      ])
    ).toBe("total_too_large");
    expect(getSupportAttachmentLimitError([{ size: 1024 }])).toBeNull();
  });
});
