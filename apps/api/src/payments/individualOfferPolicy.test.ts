import { describe, expect, it } from "vitest";
import {
  createIndividualOfferToken,
  hashIndividualOfferToken,
  resolveIndividualOfferAvailability
} from "./individualOfferPolicy";

const assignedUserId = "11111111-1111-4111-8111-111111111111";
const anotherUserId = "22222222-2222-4222-8222-222222222222";
const createdAt = new Date("2026-07-30T08:00:00.000Z");
const expiresAt = new Date("2026-07-31T08:00:00.000Z");

function offer(status: "active" | "checkout_pending" | "paid" | "expired" | "cancelled" = "active") {
  return { userId: assignedUserId, status, createdAt, expiresAt };
}

describe("individual payment offer policy", () => {
  it("creates a 256-bit URL-safe token and stores only its SHA-256 identity", () => {
    const result = createIndividualOfferToken();

    expect(Buffer.from(result.token, "base64url")).toHaveLength(32);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.tokenHash).toBe(hashIndividualOfferToken(result.token));
    expect(result.tokenHash).not.toContain(result.token);
  });

  it("does not reveal an offer assigned to another authenticated user", () => {
    expect(resolveIndividualOfferAvailability(offer(), anotherUserId, createdAt)).toBe("unavailable");
  });

  it("keeps an assigned offer available until the exact 24-hour deadline", () => {
    expect(resolveIndividualOfferAvailability(offer(), assignedUserId, new Date(expiresAt.getTime() - 1))).toBe("available");
    expect(resolveIndividualOfferAvailability(offer(), assignedUserId, expiresAt)).toBe("expired");
  });

  it.each([
    ["paid", "paid"],
    ["expired", "expired"],
    ["cancelled", "cancelled"]
  ] as const)("returns the terminal %s state", (status, expected) => {
    expect(resolveIndividualOfferAvailability(offer(status), assignedUserId, createdAt)).toBe(expected);
  });

  it("keeps a checkout-pending offer visible to its assigned client", () => {
    expect(resolveIndividualOfferAvailability(offer("checkout_pending"), assignedUserId, createdAt)).toBe("available");
  });
});
