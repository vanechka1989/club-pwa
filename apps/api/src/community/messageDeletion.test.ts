import { describe, expect, it } from "vitest";
import { getMessagePurgeAt, shouldHardDeleteMessages } from "./messageDeletion";

describe("messageDeletion", () => {
  it("schedules single message cleanup after 30 minutes for admins", () => {
    const now = new Date("2026-06-25T10:00:00.000Z");

    expect(getMessagePurgeAt("message", "admin", now)?.toISOString()).toBe("2026-06-25T10:30:00.000Z");
  });

  it("schedules whole topic cleanup after 24 hours for admins", () => {
    const now = new Date("2026-06-25T10:00:00.000Z");

    expect(getMessagePurgeAt("topic", "admin", now)?.toISOString()).toBe("2026-06-26T10:00:00.000Z");
  });

  it("hard deletes immediately for owners", () => {
    const now = new Date("2026-06-25T10:00:00.000Z");

    expect(shouldHardDeleteMessages("owner")).toBe(true);
    expect(getMessagePurgeAt("message", "owner", now)).toBeNull();
    expect(getMessagePurgeAt("topic", "owner", now)).toBeNull();
  });
});
