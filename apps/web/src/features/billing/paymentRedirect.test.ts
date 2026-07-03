import { describe, expect, it, vi } from "vitest";
import { openPaymentCheckoutUrl } from "./paymentRedirect";

describe("payment redirect", () => {
  it("opens checkout through Telegram without replacing the mini app page", () => {
    const openLink = vi.fn();
    const open = vi.fn();
    const assign = vi.fn();

    const result = openPaymentCheckoutUrl("https://pay.example/order", {
      Telegram: { WebApp: { openLink } },
      open,
      location: { assign }
    });

    expect(result).toBe("telegram");
    expect(openLink).toHaveBeenCalledWith("https://pay.example/order", { try_instant_view: false });
    expect(open).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("falls back to a new browser tab outside Telegram", () => {
    const open = vi.fn(() => ({}));
    const assign = vi.fn();

    const result = openPaymentCheckoutUrl("https://pay.example/order", {
      open,
      location: { assign }
    });

    expect(result).toBe("window");
    expect(open).toHaveBeenCalledWith("https://pay.example/order", "_blank", "noopener,noreferrer");
    expect(assign).not.toHaveBeenCalled();
  });
});
