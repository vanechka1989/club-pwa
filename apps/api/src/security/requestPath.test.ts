import { describe, expect, it } from "vitest";
import { redactSensitiveRequestPath } from "./requestPath";

describe("sensitive request path redaction", () => {
  it("removes personal offer tokens from detail and checkout paths", () => {
    const token = "AbCdEf0123456789_-AbCdEf0123456789_-AbCdEf";
    expect(redactSensitiveRequestPath(`/payments/offers/${token}`)).toBe("/payments/offers/[redacted]");
    expect(redactSensitiveRequestPath(`/payments/offers/${token}/checkout`)).toBe("/payments/offers/[redacted]/checkout");
  });

  it("keeps unrelated paths intact", () => {
    expect(redactSensitiveRequestPath("/payments/checkout")).toBe("/payments/checkout");
  });

  it("redacts tokens embedded in absolute client error URLs", () => {
    const token = "AbCdEf0123456789_-AbCdEf0123456789_-AbCdEf";
    expect(redactSensitiveRequestPath(`https://club.example/payments/offers/${token}?from=push`))
      .toBe("https://club.example/payments/offers/[redacted]?from=push");
  });
});
