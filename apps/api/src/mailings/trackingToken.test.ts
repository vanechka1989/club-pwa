import { describe, expect, it } from "vitest";
import { createMailingTrackingToken, verifyMailingTrackingToken } from "./trackingToken";

describe("mailing tracking tokens", () => {
  const secret = "tracking-test-secret";

  it.each(["open", "push"] as const)("round-trips a %s token", (purpose) => {
    const payload = { purpose, recipientId: "9cf746ce-65af-4aa0-b0c1-3d18adb63e31" };
    expect(verifyMailingTrackingToken(createMailingTrackingToken(payload, secret), secret)).toEqual(payload);
  });

  it("round-trips a safe click destination", () => {
    const payload = {
      purpose: "click" as const,
      recipientId: "9cf746ce-65af-4aa0-b0c1-3d18adb63e31",
      destination: "https://example.com/report?a=1#summary",
    };
    expect(verifyMailingTrackingToken(createMailingTrackingToken(payload, secret), secret)).toEqual(payload);
  });

  it("rejects tampered tokens", () => {
    const token = createMailingTrackingToken(
      { purpose: "open", recipientId: "9cf746ce-65af-4aa0-b0c1-3d18adb63e31" },
      secret,
    );
    expect(verifyMailingTrackingToken(`${token}x`, secret)).toBeNull();
  });

  it.each(["javascript:alert(1)", "mailto:test@example.com", "/relative"])(
    "rejects unsafe click destination %s",
    (destination) => {
      expect(() =>
        createMailingTrackingToken(
          { purpose: "click", recipientId: "9cf746ce-65af-4aa0-b0c1-3d18adb63e31", destination },
          secret,
        ),
      ).toThrow("HTTP or HTTPS");
    },
  );
});
