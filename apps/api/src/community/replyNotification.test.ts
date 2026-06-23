import { describe, expect, it } from "vitest";
import { formatReplyNotificationText } from "./replyNotification";

describe("replyNotification", () => {
  it("builds reply notification text", () => {
    expect(
      formatReplyNotificationText({
        senderName: "Ivan",
        topicTitle: "Общение",
        body: "Привет"
      })
    ).toBe('Вам ответили в чате "Общение".\nIvan: Привет');
  });

  it("trims long reply preview", () => {
    const message = "а".repeat(130);

    expect(
      formatReplyNotificationText({
        senderName: "Ivan",
        topicTitle: "Общение",
        body: message
      })
    ).toHaveLength('Вам ответили в чате "Общение".\nIvan: '.length + 120);
  });
});
