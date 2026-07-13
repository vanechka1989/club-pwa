import { describe, expect, it } from "vitest";
import { createMailingUnsubscribeToken, verifyMailingUnsubscribeToken } from "./unsubscribe";

describe("mailing unsubscribe tokens", () => {
  const secret = "test-secret-with-enough-entropy";

  it("round-trips a signed user id", () => {
    const token = createMailingUnsubscribeToken("user-123", secret);
    expect(verifyMailingUnsubscribeToken(token, secret)).toBe("user-123");
  });

  it("rejects a tampered token", () => {
    const token = createMailingUnsubscribeToken("user-123", secret);
    expect(verifyMailingUnsubscribeToken(`${token}x`, secret)).toBeNull();
  });
});
