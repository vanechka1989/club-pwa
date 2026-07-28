import { describe, expect, it } from "vitest";
import { shouldNotifyCommunityUser } from "./notificationPolicy";

describe("shouldNotifyCommunityUser", () => {
  it("notifies for every message in all mode", () => {
    expect(shouldNotifyCommunityUser({ mode: "all", mentioned: false, replied: false })).toBe(true);
  });

  it("notifies only mentions and replies in mentions mode", () => {
    expect(shouldNotifyCommunityUser({ mode: "mentions", mentioned: false, replied: false })).toBe(false);
    expect(shouldNotifyCommunityUser({ mode: "mentions", mentioned: true, replied: false })).toBe(true);
    expect(shouldNotifyCommunityUser({ mode: "mentions", mentioned: false, replied: true })).toBe(true);
  });

  it("does not notify in off mode", () => {
    expect(shouldNotifyCommunityUser({ mode: "off", mentioned: true, replied: true })).toBe(false);
  });

  it("does not notify the message sender", () => {
    expect(
      shouldNotifyCommunityUser({
        mode: "all",
        mentioned: true,
        replied: true,
        senderUserId: "user-1",
        recipientUserId: "user-1"
      })
    ).toBe(false);
  });
});
