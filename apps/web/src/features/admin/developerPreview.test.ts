import { describe, expect, it } from "vitest";
import { canUseDeveloperPreview, normalizeAdminPreviewMode } from "./developerPreview";

describe("developer preview authorization", () => {
  it("requires the real owner role in addition to developer preview mode", () => {
    expect(canUseDeveloperPreview("owner", "developer")).toBe(true);
    expect(canUseDeveloperPreview("admin", "developer")).toBe(false);
    expect(canUseDeveloperPreview("member", "developer")).toBe(false);
    expect(canUseDeveloperPreview("owner", "admin")).toBe(false);
  });

  it("normalizes stale developer mode for every non-owner administrator", () => {
    expect(normalizeAdminPreviewMode("admin", "developer")).toBe("admin");
    expect(normalizeAdminPreviewMode("owner", "developer")).toBe("developer");
    expect(normalizeAdminPreviewMode("admin", "member-active")).toBe("member-active");
  });
});
