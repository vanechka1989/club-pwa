import { describe, expect, it } from "vitest";
import { decideProdamusWebhookAction } from "./prodamusWebhook";

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
});
