import { describe, expect, it, vi } from "vitest";
import { openPaymentCheckoutUrl } from "./paymentRedirect";

describe("payment redirect", () => {
  it("opens checkout in a new browser tab", () => {
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

  it("falls back to location assign when popups are blocked", () => {
    const open = vi.fn(() => null);
    const assign = vi.fn();

    const result = openPaymentCheckoutUrl("https://pay.example/order", {
      open,
      location: { assign }
    });

    expect(result).toBe("location");
    expect(open).toHaveBeenCalledWith("https://pay.example/order", "_blank", "noopener,noreferrer");
    expect(assign).toHaveBeenCalledWith("https://pay.example/order");
  });
});
