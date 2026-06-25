import { describe, expect, it } from "vitest";
import { canManagePaymentSettings, canReadPaymentSettings } from "./adminAccess";

describe("payment admin access", () => {
  it("allows admins and owners to read payment settings", () => {
    expect(canReadPaymentSettings("owner")).toBe(true);
    expect(canReadPaymentSettings("admin")).toBe(true);
    expect(canReadPaymentSettings("member")).toBe(false);
  });

  it("allows only owners to manage provider and products", () => {
    expect(canManagePaymentSettings("owner")).toBe(true);
    expect(canManagePaymentSettings("admin")).toBe(false);
    expect(canManagePaymentSettings("member")).toBe(false);
  });
});
