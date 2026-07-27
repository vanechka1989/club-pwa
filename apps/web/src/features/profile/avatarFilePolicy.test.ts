import { describe, expect, it } from "vitest";
import { getAvatarFileError } from "./avatarFilePolicy";

describe("avatar file policy", () => {
  it("accepts a supported image at exactly 10 MiB", () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024)], "avatar.webp", { type: "image/webp" });

    expect(getAvatarFileError(file)).toBeNull();
  });

  it("rejects an image larger than 10 MiB", () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "avatar.jpg", { type: "image/jpeg" });

    expect(getAvatarFileError(file)).toBe("file_too_large");
  });

  it("rejects unsupported and empty files", () => {
    expect(getAvatarFileError(new File(["x"], "avatar.gif", { type: "image/gif" }))).toBe("unsupported_type");
    expect(getAvatarFileError(new File([], "avatar.png", { type: "image/png" }))).toBe("empty_file");
  });
});
