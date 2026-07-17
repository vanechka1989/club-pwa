import { describe, expect, it } from "vitest";
import { getLatestPaidOrder } from "./profilePayments";

describe("profile payment summary", () => {
  it("ignores a newer pending checkout and returns the latest completed payment", () => {
    const result = getLatestPaidOrder([
      { id: "pending", status: "pending", createdAt: "2026-07-17T10:00:00.000Z" },
      { id: "paid", status: "paid", createdAt: "2026-07-10T10:00:00.000Z" }
    ]);

    expect(result?.id).toBe("paid");
  });

  it("returns null when the client has never completed a payment", () => {
    expect(getLatestPaidOrder([
      { id: "pending", status: "pending", createdAt: "2026-07-17T10:00:00.000Z" },
      { id: "failed", status: "failed", createdAt: "2026-07-16T10:00:00.000Z" },
      { id: "cancelled", status: "cancelled", createdAt: "2026-07-15T10:00:00.000Z" }
    ])).toBeNull();
  });
});
