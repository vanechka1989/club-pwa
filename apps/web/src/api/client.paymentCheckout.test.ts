import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./http", () => ({ api: mocks.api, apiUrl: "/api", getApiRequestHeaders: vi.fn(), previewModeStorageKey: "preview" }));

import { createPaymentCheckout } from "./client";

describe("payment checkout client", () => {
  it("sends the selected currency but never a client amount", async () => {
    mocks.api.mockResolvedValue({ checkoutUrl: null, message: "" });

    await createPaymentCheckout("product-id", "lava", "USD");

    expect(mocks.api).toHaveBeenCalledWith("/payments/checkout", {
      method: "POST",
      body: { productId: "product-id", provider: "lava", currency: "USD" }
    });
  });
});
