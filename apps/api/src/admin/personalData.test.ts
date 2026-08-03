import { describe, expect, it } from "vitest";
import { extractVerifiedPaymentPhone, normalizeClientPhone, protectClientContact } from "./personalData";

describe("client personal data", () => {
  it("keeps contact values for an authorized viewer", () => {
    expect(protectClientContact({
      email: "client@example.com",
      phone: "+7 (999) 123-45-67",
      phoneSource: "prodamus",
      phoneUpdatedAt: new Date("2026-08-03T10:00:00.000Z")
    }, true)).toEqual({
      email: "client@example.com",
      phone: "+7 (999) 123-45-67",
      phoneSource: "prodamus",
      phoneUpdatedAt: "2026-08-03T10:00:00.000Z",
      personalDataRestricted: false
    });
  });

  it("does not return recoverable contact values to a restricted viewer", () => {
    expect(protectClientContact({
      email: "client@example.com",
      phone: "+79991234567",
      phoneSource: "lava",
      phoneUpdatedAt: new Date("2026-08-03T10:00:00.000Z")
    }, false)).toEqual({
      email: null,
      phone: null,
      phoneSource: null,
      phoneUpdatedAt: null,
      personalDataRestricted: true
    });
  });

  it.each([
    ["+7 (999) 123-45-67", "+79991234567"],
    ["8 999 123 45 67", "89991234567"],
    ["  +44 20 7946 0958  ", "+442079460958"],
    ["123", null],
    ["not-a-phone", null],
    ["", null]
  ])("normalizes %s without inventing a number", (input, expected) => {
    expect(normalizeClientPhone(input)).toBe(expected);
  });

  it("extracts a phone only from the known provider fields", () => {
    expect(extractVerifiedPaymentPhone("prodamus", { customer_phone: "+7 (999) 123-45-67" })).toEqual({ phone: "+79991234567", phoneSource: "prodamus" });
    expect(extractVerifiedPaymentPhone("lava", { buyer: { phone: "+44 20 7946 0958" } })).toEqual({ phone: "+442079460958", phoneSource: "lava" });
    expect(extractVerifiedPaymentPhone("prodamus", { customer_phone: "bad" })).toBeNull();
  });
});
