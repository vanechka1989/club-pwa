import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("push and email mailing queue", () => {
  const source = readFileSync(resolve(__dirname, "../routes/mailings.ts"), "utf8");

  it("builds independent push and email delivery rows", () => {
    expect(source).toContain('channel: "push"');
    expect(source).toContain('channel: "email"');
    expect(source).toContain("deliveryCount: preview.response.deliveryCount");
  });

  it("dispatches email with an unsubscribe header", () => {
    expect(source).toContain('recipient.channel === "email"');
    expect(source).toContain("await sendEmail({");
    expect(source).toContain('"List-Unsubscribe"');
    expect(source).toContain("await waitForEmailDeliverySlot()");
  });

  it("counts actual push and email recipients in preview", () => {
    expect(source).toContain("pushSubscriptionCount");
    expect(source).toContain("excludedMissingEmail");
    expect(source).not.toContain("excludedBotBlocked");
  });
});
