import { describe, expect, it } from "vitest";
import {
  avatarUploadLimits,
  buildAvatarObjectKey,
  getAvatarUploadContentType,
  getAvatarUploadLimitError
} from "./avatarUpload";

describe("profile avatar uploads", () => {
  it("accepts only web-friendly image files", () => {
    expect(getAvatarUploadContentType("image/jpeg", "me.jpg")).toBe("image/jpeg");
    expect(getAvatarUploadContentType("image/png", "me.png")).toBe("image/png");
    expect(getAvatarUploadContentType("image/webp", "me.webp")).toBe("image/webp");
    expect(getAvatarUploadContentType("application/octet-stream", "me.jpeg")).toBe("image/jpeg");
    expect(getAvatarUploadContentType("video/mp4", "me.mp4")).toBeNull();
    expect(getAvatarUploadContentType("image/gif", "me.gif")).toBeNull();
  });

  it("stores avatars under a stable user scoped prefix", () => {
    expect(
      buildAvatarObjectKey({
        userId: "user-id",
        fileName: "My Photo.PNG",
        id: "upload-id",
        now: new Date("2026-07-07T01:00:00.000Z")
      })
    ).toBe("avatars/2026-07-07/user-id-upload-id-my-photo.png");
  });

  it("rejects empty or oversized avatar files before reading them into memory", () => {
    expect(getAvatarUploadLimitError({ size: 0 })).toBe("empty_file");
    expect(getAvatarUploadLimitError({ size: avatarUploadLimits.maxFileBytes + 1 })).toBe("file_too_large");
    expect(getAvatarUploadLimitError({ size: 1024 })).toBeNull();
  });
});
