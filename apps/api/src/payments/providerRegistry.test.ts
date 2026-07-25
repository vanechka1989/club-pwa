import { describe, expect, it } from "vitest";
import { getPaymentProviderAdapter } from "./providerRegistry";

describe("payment provider registry", () => {
  it("returns independent adapters", () => {
    expect(getPaymentProviderAdapter("prodamus").code).toBe("prodamus");
    expect(getPaymentProviderAdapter("lava").code).toBe("lava");
  });
});
