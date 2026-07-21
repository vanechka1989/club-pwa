import { acquisitionDestinationSchema, type AcquisitionDestination } from "@club/shared";
import { createHmac, randomUUID } from "node:crypto";

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

export function buildAcquisitionAid(value: string, suffix = randomUUID().replace(/-/g, "").slice(0, 8)) {
  const asciiLabel = normalizeAcquisitionLabel(value)
    ?.replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${asciiLabel || "link"}-${suffix.toLowerCase()}`;
}

type TrackedLink = { aid: string; source: string; medium: string; campaign: string; content: string | null };

export function buildAcquisitionTrackedUrl(origin: string, link: TrackedLink) {
  const url = new URL("/", origin);
  url.searchParams.set("aid", link.aid);
  if (link.source) url.searchParams.set("utm_source", link.source);
  if (link.medium) url.searchParams.set("utm_medium", link.medium);
  if (link.campaign) url.searchParams.set("utm_campaign", link.campaign);
  if (link.content) url.searchParams.set("utm_content", link.content);
  return url.toString();
}

export function buildAcquisitionShortUrl(origin: string, aid: string) {
  return new URL(`/go/${encodeURIComponent(aid)}`, origin).toString();
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
