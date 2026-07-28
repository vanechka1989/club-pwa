import { describe, expect, it } from "vitest";
import {
  canAuthorMutateMessage,
  getDeletedContentExpiry,
  serializeDeletedBody
} from "./messageLifecycle";

const at = (value: string) => new Date(`2026-07-28T${value}:00.000Z`);
const messageAt = (value: string) => ({
  userId: "owner",
  createdAt: at(value),
  deletedByUserAt: null
});

describe("message lifecycle", () => {
  it("allows the author to mutate an active message for fifteen minutes", () => {
    expect(canAuthorMutateMessage(messageAt("10:00"), "owner", new Date("2026-07-28T10:14:59.000Z"))).toBe(true);
    expect(canAuthorMutateMessage(messageAt("10:00"), "owner", new Date("2026-07-28T10:15:01.000Z"))).toBe(false);
  });

  it("rejects mutations by another user or after user deletion", () => {
    expect(canAuthorMutateMessage(messageAt("10:00"), "other", at("10:05"))).toBe(false);
    expect(
      canAuthorMutateMessage(
        { ...messageAt("10:00"), deletedByUserAt: at("10:02") },
        "owner",
        at("10:05")
      )
    ).toBe(false);
  });

  it("retains deleted content for thirty days", () => {
    expect(getDeletedContentExpiry(new Date("2026-07-28T00:00:00.000Z")).toISOString()).toBe(
      "2026-08-27T00:00:00.000Z"
    );
  });

  it("shows retained content only to moderators", () => {
    expect(serializeDeletedBody({ moderator: false, originalBody: "secret", purged: false })).toBe(
      "Сообщение удалено"
    );
    expect(serializeDeletedBody({ moderator: true, originalBody: "secret", purged: false })).toBe("secret");
    expect(serializeDeletedBody({ moderator: true, originalBody: "secret", purged: true })).toBe(
      "Сообщение удалено"
    );
  });
});
