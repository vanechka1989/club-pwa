import { describe, expect, it } from "vitest";
import { buildSupportAttachmentObjectKey, getSupportAttachmentUploadContentType } from "./mediaUpload";

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
});
