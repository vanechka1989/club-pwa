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
      testBuyerEmail: "buyer-test@example.com",
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
    expect(response.testBuyerEmail).toBe("buyer-test@example.com");
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
      testBuyerEmail: null,
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

  it("lets only a payment settings manager explicitly reveal the saved Lava webhook key", () => {
    const route = readFileSync(new URL("../routes/payments.ts", import.meta.url), "utf8");
    const start = route.indexOf('.post("/admin/providers/lava/webhook-secret"');
    const end = route.indexOf('.post("/admin/providers/lava/check"', start);
    const block = route.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("canManagePaymentSettings");
    expect(block).toContain("decryptProviderSecret(provider.webhookSecret)");
    expect(block).toContain('action: "payment.provider.webhook_secret.revealed"');
  });
});
