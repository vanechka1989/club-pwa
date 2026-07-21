import { acquisitionDestinationSchema, type AcquisitionDestination } from "@club/shared";

const visitorStorageKey = "club-acquisition-visitor-id";
const destinationStorageKey = "club-acquisition-post-auth";
const visitorPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type RecordLanding = (payload: { aid: string; visitorId: string }) => Promise<{ accepted: boolean; destination: AcquisitionDestination }>;

function defaultStorage(): StorageLike {
  return window.localStorage;
}

export function getAcquisitionVisitorId(storage: StorageLike = defaultStorage(), createId = () => crypto.randomUUID()) {
  const existing = storage.getItem(visitorStorageKey);
  if (existing && visitorPattern.test(existing)) return existing;
  const visitorId = createId();
  storage.setItem(visitorStorageKey, visitorId);
  return visitorId;
}

export function getStoredAcquisitionVisitorId(storage: StorageLike = defaultStorage()) {
  const existing = storage.getItem(visitorStorageKey);
  return existing && visitorPattern.test(existing) ? existing : null;
}

export async function captureAcquisitionLanding(
  search: string,
  storage: StorageLike = defaultStorage(),
  recordLanding: RecordLanding
) {
  const aid = new URLSearchParams(search).get("aid")?.trim().toLowerCase();
  if (!aid || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(aid)) return null;
  try {
    const visitorId = getAcquisitionVisitorId(storage);
    const response = await recordLanding({ aid, visitorId });
    const destination = acquisitionDestinationSchema.safeParse(response.destination);
    if (!destination.success) return null;
    storage.setItem(destinationStorageKey, JSON.stringify(destination.data));
    return destination.data;
  } catch {
    return null;
  }
}

export function consumePostAuthDestination(storage: StorageLike = defaultStorage()) {
  const raw = storage.getItem(destinationStorageKey);
  storage.removeItem(destinationStorageKey);
  if (!raw) return null;
  try {
    const parsed = acquisitionDestinationSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function getPostAuthDestinationPath(destination: AcquisitionDestination) {
  if (destination.kind === "billing") return "/payments";
  if (destination.kind === "module") return `/learning?module=${encodeURIComponent(destination.moduleId)}`;
  return "/profile";
}
