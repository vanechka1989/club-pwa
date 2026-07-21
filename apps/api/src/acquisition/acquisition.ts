import { acquisitionDestinationSchema, type AcquisitionDestination } from "@club/shared";
import { createHmac } from "node:crypto";

export const acquisitionVisitWindowMs = 30 * 60 * 1000;

export function normalizeAcquisitionLabel(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return normalized || null;
}

export function normalizeAcquisitionDestination(input: unknown): AcquisitionDestination {
  const parsed = acquisitionDestinationSchema.safeParse(input);
  return parsed.success ? parsed.data : { kind: "home" };
}

export function hashAcquisitionVisitorId(visitorId: string, secret: string) {
  return createHmac("sha256", secret).update(`acquisition-visitor:v1:${visitorId.trim()}`).digest("hex");
}

export function isSameAcquisitionWindow(left: Date, right: Date) {
  const difference = Math.abs(right.getTime() - left.getTime());
  return difference < acquisitionVisitWindowMs;
}
