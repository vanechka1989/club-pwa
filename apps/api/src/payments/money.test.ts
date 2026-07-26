import { describe, expect, it } from "vitest";
import { majorToMinor, minorToMajor, PaymentMoneyError } from "./money";

describe("payment money conversion", () => {
  it("converts string and numeric major units without floating-point truncation", () => {
    expect(majorToMinor("19.99")).toBe(1999);
    expect(majorToMinor(19.99)).toBe(1999);
    expect(minorToMajor(1999)).toBe(19.99);
  });

  it("rejects malformed values and fractions beyond two decimal places", () => {
    expect(() => majorToMinor("19.999")).toThrow(PaymentMoneyError);
    expect(() => majorToMinor("19,99")).toThrow(PaymentMoneyError);
    expect(() => majorToMinor(-1)).toThrow(PaymentMoneyError);
  });
});
