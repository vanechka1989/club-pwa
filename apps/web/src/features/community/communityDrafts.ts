export type CommunityDraftContext = {
  userId: string;
  deviceId: string;
  storage?: Storage;
  now?: () => number;
};

type StoredCommunityDraft = {
  userId: string;
  deviceId: string;
  topicId: string;
  text: string;
  updatedAt: number;
};

const storageKey = "club-community-drafts-v1";
const maximumDrafts = 50;
const maximumDraftLength = 20_000;
let activeContext: Required<CommunityDraftContext> | null = null;

function isStoredDraft(value: unknown): value is StoredCommunityDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredCommunityDraft>;
  return typeof candidate.userId === "string"
    && candidate.userId.length > 0
    && typeof candidate.deviceId === "string"
    && candidate.deviceId.length > 0
    && typeof candidate.topicId === "string"
    && candidate.topicId.length > 0
    && typeof candidate.text === "string"
    && candidate.text.length <= maximumDraftLength
    && typeof candidate.updatedAt === "number"
    && Number.isFinite(candidate.updatedAt);
}

function removeStorageKey(storage: Storage) {
  try {
    storage.removeItem(storageKey);
  } catch {
    // Storage may be blocked in private mode.
  }
}

function readDrafts(storage: Storage) {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isStoredDraft)) {
      removeStorageKey(storage);
      return [];
    }
    return parsed;
  } catch {
    removeStorageKey(storage);
    return [];
  }
}

function writeDrafts(storage: Storage, drafts: StoredCommunityDraft[]) {
  try {
    if (drafts.length) storage.setItem(storageKey, JSON.stringify(drafts));
    else storage.removeItem(storageKey);
  } catch {
    // The current in-memory composer continues to work without persistence.
  }
}

function context() {
  return activeContext;
}

export function configureCommunityDrafts(input: CommunityDraftContext) {
  activeContext = {
    userId: input.userId,
    deviceId: input.deviceId,
    storage: input.storage ?? localStorage,
    now: input.now ?? Date.now
  };
}

export function resetCommunityDrafts() {
  activeContext = null;
}

export function loadDraft(topicId: string) {
  const current = context();
  if (!current || !topicId) return "";
  return readDrafts(current.storage).find((draft) =>
    draft.userId === current.userId
    && draft.deviceId === current.deviceId
    && draft.topicId === topicId
  )?.text ?? "";
}

export function saveDraft(topicId: string, text: string) {
  const current = context();
  if (!current || !topicId) return;
  const drafts = readDrafts(current.storage).filter((draft) =>
    draft.userId !== current.userId
    || draft.deviceId !== current.deviceId
    || draft.topicId !== topicId
  );
  const normalizedText = text.slice(0, maximumDraftLength);
  if (normalizedText) {
    drafts.push({
      userId: current.userId,
      deviceId: current.deviceId,
      topicId,
      text: normalizedText,
      updatedAt: current.now()
    });
  }
  writeDrafts(
    current.storage,
    drafts.sort((left, right) => right.updatedAt - left.updatedAt).slice(0, maximumDrafts)
  );
}

export function clearCommunityDraftsForUser(userId: string, storage: Storage = localStorage) {
  writeDrafts(storage, readDrafts(storage).filter((draft) => draft.userId !== userId));
}
