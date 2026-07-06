import { describe, expect, it } from "vitest";
import { normalizeAvatarDisplay } from "./avatarDisplay";

describe("profile avatar display", () => {
  it("uses centered display defaults", () => {
    expect(normalizeAvatarDisplay(null)).toEqual({
      avatarPositionX: 50,
      avatarPositionY: 50,
      avatarScale: 1
    });
  });

  it("clamps avatar position and scale to safe UI bounds", () => {
    expect(
      normalizeAvatarDisplay({
        avatarPositionX: -40,
        avatarPositionY: 180,
        avatarScale: 9
      })
    ).toEqual({
      avatarPositionX: 0,
      avatarPositionY: 100,
      avatarScale: 2.5
    });
  });
});
