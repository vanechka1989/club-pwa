import { describe, expect, it } from "vitest";
import { LavaWebhookError, parseLavaWebhook } from "./lavaWebhook";

const basePayload = {
  product: {
    id: "d31384b8-e412-4be5-a2ec-297ae6666c8f",
    title: "Клуб"
  },
  buyer: { email: "buyer@example.com" },
  contractId: "7ea82675-4ded-4133-95a7-a6efbaf165cc",
  parentContractId: null,
  amount: 990,
  currency: "RUB",
  timestamp: "2026-07-25T10:00:00.000Z",
  status: "completed",
  errorMessage: ""
};

function lavaRequest(eventType: string, key = "correct", overrides: Record<string, unknown> = {}) {
  return new Request("https://club.example/api/payments/lava/webhook/payment", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key
    },
    body: JSON.stringify({ ...basePayload, ...overrides, eventType })
  });
}

describe("Lava webhook", () => {
  it("rejects a webhook with a wrong key", async () => {
    await expect(parseLavaWebhook(lavaRequest("payment.success", "wrong"), "correct"))
      .rejects.toEqual(new LavaWebhookError(401, "Invalid webhook authentication"));
  });

  it("accepts the Lava API key when it was configured as webhook authentication", async () => {
    const event = await parseLavaWebhook(
      lavaRequest("payment.success", "lava-api-key"),
      ["separate-webhook-key", "lava-api-key"]
    );

    expect(event.type).toBe("payment_succeeded");
  });

  it("normalizes decimal major-unit amounts into exact currency minor units", async () => {
    const event = await parseLavaWebhook(lavaRequest("payment.success", "correct", {
      amount: 19.99,
      currency: "usd"
    }), "correct");

    expect((event as unknown as { currency: unknown; amountMinor: unknown })).toMatchObject({
      currency: "USD",
      amountMinor: 1999
    });
    expect(event).not.toHaveProperty("amountRub");
  });

  it.each([
    ["payment.success", "payment_succeeded"],
    ["payment.failed", "payment_failed"],
    ["subscription.recurring.payment.success", "renewal_succeeded"],
    ["subscription.recurring.payment.failed", "renewal_failed"],
    ["subscription.cancelled", "subscription_cancelled"]
  ] as const)("normalizes %s", async (sourceType, expectedType) => {
    const event = await parseLavaWebhook(lavaRequest(sourceType), "correct");
    expect(event.type).toBe(expectedType);
    expect(event.eventKey).toBe(`${sourceType}:7ea82675-4ded-4133-95a7-a6efbaf165cc`);
    expect(event.externalPaymentId).toBe("7ea82675-4ded-4133-95a7-a6efbaf165cc");
  });

  it("uses parent contract to locate a recurring subscription", async () => {
    const event = await parseLavaWebhook(lavaRequest("subscription.recurring.payment.success", "correct", {
      contractId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      parentContractId: "7ea82675-4ded-4133-95a7-a6efbaf165cc",
      status: "subscription-active"
    }), "correct");

    expect(event.externalOrderId).toBe("7ea82675-4ded-4133-95a7-a6efbaf165cc");
    expect(event.externalSubscriptionId).toBe("7ea82675-4ded-4133-95a7-a6efbaf165cc");
  });

  it("rejects an invalid content type and oversized body", async () => {
    const invalidType = new Request("https://club.example/webhook", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-api-key": "correct" },
      body: "{}"
    });
    const oversized = lavaRequest("payment.success", "correct", { errorMessage: "x".repeat(70_000) });

    await expect(parseLavaWebhook(invalidType, "correct")).rejects.toMatchObject({ status: 415 });
    await expect(parseLavaWebhook(oversized, "correct")).rejects.toMatchObject({ status: 413 });
  });
});
