import { describe, expect, it } from "vitest";
import {
  classifyProdamusWebhookPaymentStatus,
  decideProdamusWebhookAction,
  getProdamusWebhookSuccessResponse,
  parseProdamusWebhookRequest,
  validateProdamusWebhookOrder
} from "./prodamusWebhook";

describe("prodamus webhook action", () => {
  it("ignores valid webhooks for orders that do not belong to this club", () => {
    expect(
      decideProdamusWebhookAction({
        providerConfigured: true,
        isValidSignature: true,
        orderId: "external-order-1",
        orderFound: false
      })
    ).toEqual({ action: "ignore", status: 200 });
  });

  it("rejects untrusted webhooks before checking order ownership", () => {
    expect(
      decideProdamusWebhookAction({
        providerConfigured: true,
        isValidSignature: false,
        orderId: "external-order-1",
        orderFound: false
      })
    ).toEqual({ action: "reject", status: 400 });
  });

  it("processes valid webhooks for known club orders", () => {
    expect(
      decideProdamusWebhookAction({
        providerConfigured: true,
        isValidSignature: true,
        orderId: "club-order-1",
        orderFound: true
      })
    ).toEqual({ action: "process", status: 200 });
  });

  it("uses the provider-compatible success body for accepted webhooks", () => {
    expect(getProdamusWebhookSuccessResponse()).toBe("success");
  });

  it("fails closed when payment status is missing or unknown", () => {
    expect(classifyProdamusWebhookPaymentStatus({})).toBe("ignore");
    expect(classifyProdamusWebhookPaymentStatus({ payment_status: "processing" })).toBe("ignore");
    expect(classifyProdamusWebhookPaymentStatus({ payment_status: "success" })).toBe("paid");
    expect(classifyProdamusWebhookPaymentStatus({ payment_status: "failed" })).toBe("failed");
  });

  it("requires signed order contents to match the stored amount and product", () => {
    const expected = { amountRub: 990, productTitle: "Premium" };
    expect(
      validateProdamusWebhookOrder(
        { products: [{ name: "Premium", price: "990.00", quantity: "1" }] },
        expected
      )
    ).toBe(true);
    expect(validateProdamusWebhookOrder({ products: [{ name: "Premium", price: "9.90", quantity: "1" }] }, expected)).toBe(false);
    expect(validateProdamusWebhookOrder({ products: [{ name: "Other", price: "990", quantity: "1" }] }, expected)).toBe(false);
    expect(validateProdamusWebhookOrder({}, expected)).toBe(false);
  });

  it("rejects oversized and unsupported webhook bodies before parsing", async () => {
    const oversized = new Request("https://club.example/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: "x".repeat(70_000) })
    });
    await expect(parseProdamusWebhookRequest(oversized)).rejects.toMatchObject({ status: 413 });

    const unsupported = new Request("https://club.example/webhook", {
      method: "POST",
      headers: { "content-type": "multipart/form-data" },
      body: "payload"
    });
    await expect(parseProdamusWebhookRequest(unsupported)).rejects.toMatchObject({ status: 415 });
  });

  it("reconstructs nested product data from Prodamus form notifications", async () => {
    const form = new URLSearchParams({
      order_num: "club-order-1",
      payment_status: "success",
      "products[0][name]": "Premium",
      "products[0][price]": "990.00",
      "products[0][quantity]": "1"
    });
    const request = new Request("https://club.example/webhook", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form
    });

    await expect(parseProdamusWebhookRequest(request)).resolves.toMatchObject({
      order_num: "club-order-1",
      payment_status: "success",
      products: [{ name: "Premium", price: "990.00", quantity: "1" }]
    });
  });
});
