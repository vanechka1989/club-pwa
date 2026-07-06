import { describe, expect, it } from "vitest";
import { buildWebPushPayload, normalizePushSubscription } from "./webPush";

describe("web push", () => {
  it("normalizes browser push subscriptions", () => {
    expect(
      normalizePushSubscription({
        endpoint: " https://push.example/subscription ",
        keys: {
          p256dh: "p256dh-key",
          auth: "auth-key"
        }
      })
    ).toEqual({
      endpoint: "https://push.example/subscription",
      p256dh: "p256dh-key",
      auth: "auth-key"
    });
  });

  it("rejects incomplete push subscriptions", () => {
    expect(normalizePushSubscription({ endpoint: "https://push.example/subscription", keys: { auth: "auth-key" } })).toBeNull();
  });

  it("builds compact notification payloads for the service worker", () => {
    expect(
      buildWebPushPayload({
        title: "Новое сообщение",
        body: "Вам ответили в поддержке",
        url: "/?section=support"
      })
    ).toEqual({
      title: "Новое сообщение",
      body: "Вам ответили в поддержке",
      url: "/?section=support"
    });
  });
});
