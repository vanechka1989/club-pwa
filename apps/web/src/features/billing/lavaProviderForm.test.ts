import { describe, expect, it, vi } from "vitest";
import { buildLavaProviderForm } from "./lavaProviderForm";

describe("Lava provider form", () => {
  it("preserves an unsaved generated webhook key when the connection form is reopened", () => {
    const generate = vi.fn(() => "new-generated-key");

    expect(buildLavaProviderForm(null, "existing-unsaved-key", generate)).toEqual({
      apiKey: "",
      webhookSecret: "existing-unsaved-key",
      testBuyerEmail: "",
      isEnabled: true
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("generates the webhook key only once for a new Lava connection", () => {
    const generate = vi.fn(() => "new-generated-key");

    expect(buildLavaProviderForm(null, "", generate).webhookSecret).toBe("new-generated-key");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("does not expose a saved provider key until the owner requests it", () => {
    const generate = vi.fn(() => "new-generated-key");

    expect(buildLavaProviderForm({ isEnabled: false, testBuyerEmail: "buyer-test@example.com" }, "stale-value", generate)).toEqual({
      apiKey: "",
      webhookSecret: "",
      testBuyerEmail: "buyer-test@example.com",
      isEnabled: false
    });
    expect(generate).not.toHaveBeenCalled();
  });
});
