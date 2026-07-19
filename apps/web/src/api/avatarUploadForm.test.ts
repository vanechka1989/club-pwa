import { describe, expect, it } from "vitest";
import { createAvatarUploadFormData } from "./client";

describe("avatar upload form", () => {
  it("sends the selected file and draft crop settings together", () => {
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    const formData = createAvatarUploadFormData(file, {
      avatarPositionX: 31.25,
      avatarPositionY: 68.75,
      avatarScale: 1.4
    });

    expect(formData.get("avatar")).toBe(file);
    expect(formData.get("avatarPositionX")).toBe("31.25");
    expect(formData.get("avatarPositionY")).toBe("68.75");
    expect(formData.get("avatarScale")).toBe("1.4");
  });
});
