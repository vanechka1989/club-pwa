import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import PaymentProviderSettings from "./PaymentProviderSettings.vue";

describe("PaymentProviderSettings", () => {
  it("shows configured Lava state and webhook addresses without exposing a key", () => {
    render(PaymentProviderSettings, {
      props: {
        provider: {
          id: "lava",
          provider: "lava",
          title: "Lava",
          formUrl: "",
          sys: "",
          isEnabled: true,
          secretConfigured: true,
          webhookSecretConfigured: true,
          connectionState: "verified",
          lastCheckedAt: "2026-07-25T10:00:00.000Z",
          lastCheckError: null,
          webhookUrls: {
            payment: "https://club.example/api/payments/lava/webhook/payment",
            subscription: "https://club.example/api/payments/lava/webhook/subscription"
          }
        }
      }
    });

    expect(screen.getByText("Соединение проверено")).toBeTruthy();
    expect(screen.getByDisplayValue(/webhook\/payment/)).toBeTruthy();
    expect(screen.getByDisplayValue(/webhook\/subscription/)).toBeTruthy();
    expect(screen.queryByText("lava-secret-key")).toBeNull();
  });
});
