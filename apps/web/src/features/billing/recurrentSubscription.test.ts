import type { UserRecurrentSubscription } from "@club/shared";
import { describe, expect, it } from "vitest";
import { findActiveRecurrentSubscription, shouldBlockNewPayments } from "./recurrentSubscription";

const activeSubscription = {
  id: "active-subscription",
  productId: "product-1",
  title: "Подписка",
  status: "active",
  cancelledAt: null,
  createdAt: "2026-06-25T10:00:00.000Z"
} satisfies UserRecurrentSubscription;

const cancelledSubscription = {
  ...activeSubscription,
  id: "cancelled-subscription",
  status: "cancelled",
  cancelledAt: "2026-06-25T11:00:00.000Z"
} satisfies UserRecurrentSubscription;

describe("recurrent subscription UI guard", () => {
  it("finds the active recurrent subscription", () => {
    expect(findActiveRecurrentSubscription([cancelledSubscription, activeSubscription])).toEqual(activeSubscription);
  });

  it("blocks new payments only while recurrent subscription is active", () => {
    expect(shouldBlockNewPayments([activeSubscription])).toBe(true);
    expect(shouldBlockNewPayments([cancelledSubscription])).toBe(false);
  });
});
