import { describe, expect, it, vi } from "vitest";
import { buildLavaProviderForm } from "./lavaProviderForm";

describe("Lava provider form", () => {
  it("preserves an unsaved generated webhook key when the connection form is reopened", () => {
    const generate = vi.fn(() => "new-generated-key");

    expect(buildLavaProviderForm(null, "existing-unsaved-key", generate)).toEqual({
      apiKey: "",
      webhookSecret: "existing-unsaved-key",
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

    expect(buildLavaProviderForm({ isEnabled: false }, "stale-value", generate)).toEqual({
      apiKey: "",
      webhookSecret: "",
      isEnabled: false
    });
    expect(generate).not.toHaveBeenCalled();
  });
});
