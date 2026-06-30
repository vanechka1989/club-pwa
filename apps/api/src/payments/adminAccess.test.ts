import { describe, expect, it } from "vitest";
import { canManagePaymentSettings, canReadPaymentSettings } from "./adminAccess";

describe("payment admin access", () => {
  it("allows admins and owners to read payment settings", () => {
    expect(canReadPaymentSettings("owner")).toBe(true);
    expect(canReadPaymentSettings("admin", ["payments"])).toBe(true);
    expect(canReadPaymentSettings("admin", ["statistics"])).toBe(true);
    expect(canReadPaymentSettings("admin", ["users"])).toBe(false);
    expect(canReadPaymentSettings("member")).toBe(false);
  });

  it("allows owners and admins with payment permission to manage provider and products", () => {
    expect(canManagePaymentSettings("owner")).toBe(true);
    expect(canManagePaymentSettings("admin", ["payments"])).toBe(true);
    expect(canManagePaymentSettings("admin", ["statistics"])).toBe(false);
    expect(canManagePaymentSettings("member")).toBe(false);
  });
});
