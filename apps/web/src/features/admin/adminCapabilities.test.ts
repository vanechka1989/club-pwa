import { describe, expect, it } from "vitest";
import { hasAdminCapability } from "./adminCapabilities";

describe("admin capabilities", () => {
  it("grants every capability to the owner", () => {
    expect(hasAdminCapability("owner", [], "materials")).toBe(true);
    expect(hasAdminCapability("owner", undefined, "support")).toBe(true);
  });

  it("grants an administrator only explicitly assigned capabilities", () => {
    expect(hasAdminCapability("admin", ["community"], "community")).toBe(true);
    expect(hasAdminCapability("admin", ["community"], "materials")).toBe(false);
  });

  it("fails closed for an administrator with missing or empty permissions", () => {
    expect(hasAdminCapability("admin", undefined, "payments")).toBe(false);
    expect(hasAdminCapability("admin", [], "support")).toBe(false);
  });

  it("never grants admin capabilities to a member preview", () => {
    expect(hasAdminCapability("member", ["materials"], "materials")).toBe(false);
  });
});
