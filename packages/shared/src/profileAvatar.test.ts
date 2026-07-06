import { describe, expect, it } from "vitest";
import { clubUserSchema } from "./index";

const userBase = {
  id: "user-id",
  telegramId: "member@example.com",
  email: "member@example.com",
  firstName: null,
  username: "member",
  photoUrl: null,
  role: "member",
  realRole: "member",
  membershipStatus: "active",
  membershipExpiresAt: "2026-08-06T00:00:00.000Z",
  paymentType: "manual",
  recurrentPaymentStatus: null,
  nextPaymentAt: null,
  avatarRefreshedAt: null
};

describe("club user avatar display schema", () => {
  it("defaults avatar display to a centered circle crop", () => {
    const parsed = clubUserSchema.parse(userBase);

    expect(parsed.avatarPositionX).toBe(50);
    expect(parsed.avatarPositionY).toBe(50);
    expect(parsed.avatarScale).toBe(1);
  });

  it("accepts persisted avatar display preferences", () => {
    const parsed = clubUserSchema.parse({
      ...userBase,
      avatarPositionX: 42,
      avatarPositionY: 58,
      avatarScale: 1.4
    });

    expect(parsed.avatarPositionX).toBe(42);
    expect(parsed.avatarPositionY).toBe(58);
    expect(parsed.avatarScale).toBe(1.4);
  });
});
