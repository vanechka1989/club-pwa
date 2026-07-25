import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mapPaymentProviderForAdmin } from "./providerAdminService";

describe("payment provider administration", () => {
  it("returns Lava connection state and webhook URLs without secrets", () => {
    const response = mapPaymentProviderForAdmin({
      id: "provider-1",
      provider: "lava",
      title: "Lava",
      formUrl: "",
      secretKey: "",
      sys: "",
      apiKey: "enc:v1:secret",
      webhookSecret: "enc:v1:webhook",
      isEnabled: true,
      lastCheckedAt: new Date("2026-07-25T10:00:00.000Z"),
      lastCheckError: null,
      lastCatalogSyncAt: null,
      createdByUserId: null,
      createdAt: new Date("2026-07-25T09:00:00.000Z"),
      updatedAt: new Date("2026-07-25T10:00:00.000Z")
    }, "https://club.example");

    expect(response.connectionState).toBe("verified");
    expect(response.webhookUrls).toEqual({
      payment: "https://club.example/api/payments/lava/webhook/payment",
      subscription: "https://club.example/api/payments/lava/webhook/subscription"
    });
    expect(JSON.stringify(response)).not.toContain("enc:v1");
  });

  it("marks a configured provider error without exposing its technical value", () => {
    const response = mapPaymentProviderForAdmin({
      id: "provider-1",
      provider: "lava",
      title: "Lava",
      formUrl: "",
      secretKey: "",
      sys: "",
      apiKey: "encrypted",
      webhookSecret: "encrypted",
      isEnabled: true,
      lastCheckedAt: new Date("2026-07-25T10:00:00.000Z"),
      lastCheckError: "LAVA_UNAUTHORIZED",
      lastCatalogSyncAt: null,
      createdByUserId: null,
      createdAt: new Date("2026-07-25T09:00:00.000Z"),
      updatedAt: new Date("2026-07-25T10:00:00.000Z")
    }, "https://club.example");

    expect(response.connectionState).toBe("error");
    expect(response.lastCheckError).toBe("Не удалось проверить подключение.");
  });

  it("accepts a separate webhook key that Lava can send back without exposing it", () => {
    const route = readFileSync(new URL("../routes/payments.ts", import.meta.url), "utf8");
    expect(route).toContain("webhookSecret: z.string()");
    expect(route).toContain("encryptProviderSecret(body.data.webhookSecret)");
    expect(route).toContain('webhookSecret: body.data.webhookSecret ? "[changed]" : "[unchanged]"');
  });
});
