import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTelegramInitData } from "./verifyInitData";

function sign(params: Record<string, string>, botToken: string) {
  const dataCheckString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...params, hash }).toString();
}

describe("verifyTelegramInitData", () => {
  it("accepts signed Telegram initData", () => {
    const botToken = "123:token";
    const initData = sign(
      {
        auth_date: "1730000000",
        query_id: "query",
        user: JSON.stringify({ id: 42, first_name: "Ivan", username: "ivan", photo_url: "https://example.com/ivan.jpg" })
      },
      botToken
    );

    expect(verifyTelegramInitData(initData, botToken)).toEqual({
      id: "42",
      firstName: "Ivan",
      username: "ivan",
      photoUrl: "https://example.com/ivan.jpg"
    });
  });

  it("rejects tampered data", () => {
    const botToken = "123:token";
    const initData = sign({ user: JSON.stringify({ id: 42 }) }, botToken).replace("42", "43");

    expect(verifyTelegramInitData(initData, botToken)).toBeNull();
  });
});
