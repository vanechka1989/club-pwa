import { describe, expect, it } from "vitest";
import { buildTelegramWebhookPayload, setTelegramWebhook, telegramWebhookAllowedUpdates } from "./webhook";

describe("telegram webhook setup", () => {
  it("registers message and bot status updates", () => {
    expect(telegramWebhookAllowedUpdates).toEqual(["message", "my_chat_member"]);
  });

  it("builds the webhook payload from the public app origin", () => {
    expect(
      buildTelegramWebhookPayload({
        webOrigin: "https://club.example.com/",
        secretToken: "secret"
      })
    ).toEqual({
      url: "https://club.example.com/api/telegram/webhook",
      secret_token: "secret",
      allowed_updates: ["message", "my_chat_member"]
    });
  });

  it("calls Telegram setWebhook with the required allowed updates", async () => {
    let requestedUrl = "";
    let requestedPayload: unknown = null;

    await setTelegramWebhook({
      token: "token-1",
      webOrigin: "https://club.example.com",
      secretToken: "secret",
      fetchImpl: async (url, init) => {
        requestedUrl = String(url);
        requestedPayload = JSON.parse(String(init?.body ?? "{}"));

        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
    });

    expect(requestedUrl).toBe("https://api.telegram.org/bottoken-1/setWebhook");
    expect(requestedPayload).toMatchObject({
      url: "https://club.example.com/api/telegram/webhook",
      secret_token: "secret",
      allowed_updates: ["message", "my_chat_member"]
    });
  });
});
