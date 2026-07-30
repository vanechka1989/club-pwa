import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("individual payment offer route security", () => {
  it("hashes tokens, binds lookup to the authenticated user and reserves checkout atomically", () => {
    const source = readFileSync(resolve(__dirname, "individualPaymentOffers.ts"), "utf8");
    expect(source).toContain("hashIndividualOfferToken(token)");
    expect(source).toContain("eq(individualPaymentOffers.userId, userId)");
    expect(source).toContain('eq(individualPaymentOffers.status, "active")');
    expect(source).toContain("db.transaction");
    expect(source).not.toMatch(/logger\.(?:warn|info|error)\([^)]*token/);
  });

  it("never stores the plaintext token in offer history or audit metadata", () => {
    const source = readFileSync(resolve(__dirname, "adminIndividualPaymentOffers.ts"), "utf8");
    expect(source).toContain("tokenHash");
    expect(source).not.toContain("metadata: { token");
    expect(source).not.toContain("token: token");
  });
});
