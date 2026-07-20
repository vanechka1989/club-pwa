import { describe, expect, it } from "vitest";
import {
  classifyMailingDeliveryError,
  getMailingRetryDecision,
  getStaleMailingProcessingCutoff
} from "./deliveryReliability";

describe("mailing delivery reliability", () => {
  const now = new Date("2026-07-20T10:00:00.000Z");

  it("retries temporary failures after one and five minutes", () => {
    expect(getMailingRetryDecision(1, new Error("ETIMEDOUT"), now)).toEqual({
      status: "pending",
      nextAttemptAt: new Date("2026-07-20T10:01:00.000Z"),
      error: "Временная ошибка доставки"
    });
    expect(getMailingRetryDecision(2, new Error("429 Too Many Requests"), now)).toEqual({
      status: "pending",
      nextAttemptAt: new Date("2026-07-20T10:05:00.000Z"),
      error: "Временная ошибка доставки"
    });
  });

  it("stops after the third temporary attempt", () => {
    expect(getMailingRetryDecision(3, new Error("ECONNRESET"), now)).toEqual({
      status: "failed",
      nextAttemptAt: null,
      error: "Доставка не удалась после 3 попыток"
    });
  });

  it("does not retry permanent recipient failures", () => {
    expect(classifyMailingDeliveryError(new Error("Invalid recipient address"))).toBe("permanent");
    expect(getMailingRetryDecision(1, new Error("recipient unsubscribed"), now)).toEqual({
      status: "failed",
      nextAttemptAt: null,
      error: "Получатель недоступен"
    });
  });

  it("treats unknown provider errors as temporary without exposing details", () => {
    expect(classifyMailingDeliveryError({ secret: "provider-token", message: "unexpected" })).toBe("temporary");
    expect(getMailingRetryDecision(1, { secret: "provider-token" }, now).error).toBe("Временная ошибка доставки");
  });

  it("uses a ten minute stale-processing cutoff", () => {
    expect(getStaleMailingProcessingCutoff(now)).toEqual(new Date("2026-07-20T09:50:00.000Z"));
  });
});
