import { createHash, randomBytes } from "node:crypto";

export type IndividualOfferStatus = "active" | "checkout_pending" | "paid" | "expired" | "cancelled";

type IndividualOfferAvailabilityInput = {
  userId: string;
  provider: "prodamus" | "lava";
  status: IndividualOfferStatus;
  createdAt: Date;
  expiresAt: Date;
};

export type IndividualOfferAvailability = "available" | "unavailable" | "expired" | "paid" | "cancelled";

export function hashIndividualOfferToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createIndividualOfferToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashIndividualOfferToken(token) };
}

export function resolveIndividualOfferAvailability(
  offer: IndividualOfferAvailabilityInput,
  authenticatedUserId: string,
  now = new Date()
): IndividualOfferAvailability {
  if (offer.userId !== authenticatedUserId) return "unavailable";
  if (offer.status === "paid") return "paid";
  if (offer.status === "cancelled") return "cancelled";
  if (offer.status === "checkout_pending" && offer.provider === "lava") return "available";
  if (offer.status === "expired" || now.getTime() >= offer.expiresAt.getTime()) return "expired";
  return "available";
}
