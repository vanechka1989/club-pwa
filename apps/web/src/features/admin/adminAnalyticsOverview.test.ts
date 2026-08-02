import { describe, expect, it } from "vitest";
import { paymentSuccessPercent } from "./adminAnalyticsOverview";

describe("admin analytics visual overview", () => {
  it("calculates the successful payment share from all payment outcomes", () => {
    expect(paymentSuccessPercent(8, 1, 1)).toBe(80);
    expect(paymentSuccessPercent(1, 1, 1)).toBe(33);
  });

  it("keeps empty and malformed payment totals within zero to one hundred percent", () => {
    expect(paymentSuccessPercent(0, 0, 0)).toBe(0);
    expect(paymentSuccessPercent(12, -1, -1)).toBe(100);
    expect(paymentSuccessPercent(-4, 2, 2)).toBe(0);
  });
});
