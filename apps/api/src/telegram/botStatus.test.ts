import { describe, expect, it } from "vitest";
import { getTelegramBotStatusUpdate } from "./botStatus";

describe("telegram bot status updates", () => {
  it("marks a user as blocked when Telegram reports the bot was kicked", () => {
    expect(
      getTelegramBotStatusUpdate({
        my_chat_member: {
          chat: { id: 593677751, type: "private" },
          date: 1782732000,
          new_chat_member: { status: "kicked" }
        }
      })
    ).toEqual({
      telegramId: "593677751",
      status: "blocked",
      changedAt: new Date("2026-06-29T11:20:00.000Z")
    });
  });

  it("marks a user as active when Telegram reports the bot is a member again", () => {
    expect(
      getTelegramBotStatusUpdate({
        my_chat_member: {
          chat: { id: "593677751", type: "private" },
          date: 1782735600,
          new_chat_member: { status: "member" }
        }
      })
    ).toEqual({
      telegramId: "593677751",
      status: "active",
      changedAt: new Date("2026-06-29T12:20:00.000Z")
    });
  });

  it("ignores non-private chat member updates", () => {
    expect(
      getTelegramBotStatusUpdate({
        my_chat_member: {
          chat: { id: -1001, type: "group" },
          date: 1782735600,
          new_chat_member: { status: "kicked" }
        }
      })
    ).toBeNull();
  });
});
