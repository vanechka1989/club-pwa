export type QueuedTextMessage = {
  userId: string;
  deviceId: string;
  topicId: string;
  localId: string;
  deliveryKey: string;
  body: string;
  replyToMessageId: string | null;
  createdAt: number;
  status: "queued" | "sending" | "failed";
  attempts: number;
};

export type QueueTextMessageInput = {
  topicId: string;
  body: string;
  replyToMessageId?: string | null;
  localId?: string;
};

export type CommunityTextSendInput = {
  topicId: string;
  body: string;
  replyToMessageId: string | null;
  clientOperationId: string;
};

type ConfirmedMessage = {
  id: string;
  clientOperationId?: string | null;
};

type CommunityOutboxContext<TMessage extends ConfirmedMessage = ConfirmedMessage> = {
  userId: string;
  deviceId: string;
  storage?: Storage;
  send: (input: CommunityTextSendInput) => Promise<{ message: TMessage }>;
  isOnline?: () => boolean;
  now?: () => number;
  createLocalId?: () => string;
  onChange?: (messages: QueuedTextMessage[]) => void;
  onConfirmed?: (message: TMessage) => void;
};

export type QueuedTextDeliveryResult<TMessage extends ConfirmedMessage = ConfirmedMessage> = {
  delivered: boolean;
  retryable: boolean;
  entry: QueuedTextMessage;
  message: TMessage | null;
  error: unknown;
};

const storageKey = "club-community-text-outbox-v1";
const maximumMessages = 100;
const maximumBodyLength = 3_000;
let activeContext: Required<CommunityOutboxContext> | null = null;
const inFlight = new Map<string, Promise<QueuedTextDeliveryResult>>();

function defaultIsOnline() {
  return typeof navigator === "undefined" || navigator.onLine;
}

function defaultLocalId() {
  return crypto.randomUUID();
}

function getFailureStatus(reason: unknown) {
  if (!reason || typeof reason !== "object") return null;
  if ("status" in reason && typeof reason.status === "number") return reason.status;
  if ("statusCode" in reason && typeof reason.statusCode === "number") return reason.statusCode;
  if ("response" in reason && reason.response && typeof reason.response === "object"
    && "status" in reason.response && typeof reason.response.status === "number") {
    return reason.response.status;
  }
  return null;
}

function isRetryableFailure(reason: unknown) {
  const status = getFailureStatus(reason);
  return status === null || status === 408 || status === 425 || status === 429 || status >= 500;
}

function isQueuedMessage(value: unknown): value is QueuedTextMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<QueuedTextMessage>;
  return typeof candidate.userId === "string"
    && candidate.userId.length > 0
    && typeof candidate.deviceId === "string"
    && candidate.deviceId.length > 0
    && typeof candidate.topicId === "string"
    && candidate.topicId.length > 0
    && typeof candidate.localId === "string"
    && candidate.localId.length > 0
    && typeof candidate.deliveryKey === "string"
    && candidate.deliveryKey === createDeliveryKey(candidate.deviceId, candidate.localId)
    && typeof candidate.body === "string"
    && candidate.body.length > 0
    && candidate.body.length <= maximumBodyLength
    && (candidate.replyToMessageId === null || typeof candidate.replyToMessageId === "string")
    && typeof candidate.createdAt === "number"
    && Number.isFinite(candidate.createdAt)
    && (candidate.status === "queued" || candidate.status === "sending" || candidate.status === "failed")
    && typeof candidate.attempts === "number"
    && Number.isInteger(candidate.attempts)
    && candidate.attempts >= 0;
}

function removeStorageKey(storage: Storage) {
  try {
    storage.removeItem(storageKey);
  } catch {
    // Storage may be blocked in private mode.
  }
}

function readOutbox(storage: Storage) {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isQueuedMessage)) {
      removeStorageKey(storage);
      return [];
    }
    return parsed.map((entry) => entry.status === "sending" ? { ...entry, status: "queued" as const } : entry);
  } catch {
    removeStorageKey(storage);
    return [];
  }
}

function writeOutbox(storage: Storage, entries: QueuedTextMessage[]) {
  try {
    if (entries.length) storage.setItem(storageKey, JSON.stringify(entries));
    else storage.removeItem(storageKey);
  } catch {
    // The caller keeps the composer draft when durable queue persistence is unavailable.
  }
}

function currentContext() {
  return activeContext;
}

function scopedEntries(current: Required<CommunityOutboxContext>) {
  return readOutbox(current.storage).filter((entry) =>
    entry.userId === current.userId && entry.deviceId === current.deviceId
  );
}

function notifyChange(current: Required<CommunityOutboxContext>) {
  if (activeContext !== current) return;
  current.onChange(scopedEntries(current));
}

function replaceEntry(
  current: Required<CommunityOutboxContext>,
  localId: string,
  update: (entry: QueuedTextMessage) => QueuedTextMessage
) {
  const entries = readOutbox(current.storage).map((entry) =>
    entry.userId === current.userId && entry.deviceId === current.deviceId && entry.localId === localId
      ? update(entry)
      : entry
  );
  writeOutbox(current.storage, entries);
  notifyChange(current);
  return entries.find((entry) =>
    entry.userId === current.userId && entry.deviceId === current.deviceId && entry.localId === localId
  ) ?? null;
}

function removeEntry(current: Required<CommunityOutboxContext>, localId: string) {
  writeOutbox(
    current.storage,
    readOutbox(current.storage).filter((entry) =>
      entry.userId !== current.userId || entry.deviceId !== current.deviceId || entry.localId !== localId
    )
  );
  notifyChange(current);
}

export function createDeliveryKey(deviceId: string, localId: string) {
  return `${deviceId}:${localId}`;
}

export function configureCommunityOutbox<TMessage extends ConfirmedMessage>(input: CommunityOutboxContext<TMessage>) {
  activeContext = {
    userId: input.userId,
    deviceId: input.deviceId,
    storage: input.storage ?? localStorage,
    send: async (sendInput) => {
      const response = await input.send(sendInput);
      return { message: response.message as ConfirmedMessage };
    },
    isOnline: input.isOnline ?? defaultIsOnline,
    now: input.now ?? Date.now,
    createLocalId: input.createLocalId ?? defaultLocalId,
    onChange: input.onChange ?? (() => undefined),
    onConfirmed: (message) => input.onConfirmed?.(message as TMessage)
  };
  notifyChange(activeContext);
}

export function resetCommunityOutbox() {
  activeContext = null;
  inFlight.clear();
}

export function getQueuedTextMessages(topicId?: string) {
  const current = currentContext();
  if (!current) return [];
  return scopedEntries(current)
    .filter((entry) => !topicId || entry.topicId === topicId)
    .sort((left, right) => left.createdAt - right.createdAt);
}

export async function queueTextMessage<TMessage extends ConfirmedMessage = ConfirmedMessage>(
  input: QueueTextMessageInput
): Promise<QueuedTextDeliveryResult<TMessage>> {
  const current = currentContext();
  if (!current) throw new Error("community_outbox_not_configured");
  const body = input.body.trim();
  if (!body || body.length > maximumBodyLength || !input.topicId) {
    throw new Error("invalid_community_text_message");
  }
  const localId = input.localId ?? current.createLocalId();
  const existing = scopedEntries(current).find((entry) => entry.localId === localId);
  const entry: QueuedTextMessage = existing ?? {
    userId: current.userId,
    deviceId: current.deviceId,
    topicId: input.topicId,
    localId,
    deliveryKey: createDeliveryKey(current.deviceId, localId),
    body,
    replyToMessageId: input.replyToMessageId ?? null,
    createdAt: current.now(),
    status: "queued",
    attempts: 0
  };
  if (!existing) {
    const entries = [entry, ...readOutbox(current.storage)]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, maximumMessages);
    writeOutbox(current.storage, entries);
    notifyChange(current);
  }
  return retryQueuedMessage(localId) as Promise<QueuedTextDeliveryResult<TMessage>>;
}

export function retryQueuedMessage<TMessage extends ConfirmedMessage = ConfirmedMessage>(
  localId: string
): Promise<QueuedTextDeliveryResult<TMessage>> {
  const current = currentContext();
  if (!current) return Promise.reject(new Error("community_outbox_not_configured"));
  const scopeKey = `${current.userId}\u001f${current.deviceId}\u001f${localId}`;
  const active = inFlight.get(scopeKey);
  if (active) return active as Promise<QueuedTextDeliveryResult<TMessage>>;
  const entry = scopedEntries(current).find((candidate) => candidate.localId === localId);
  if (!entry) return Promise.reject(new Error("queued_community_message_not_found"));
  if (!current.isOnline()) {
    const queued = replaceEntry(current, localId, (candidate) => ({ ...candidate, status: "queued" })) ?? entry;
    return Promise.resolve({ delivered: false, retryable: true, entry: queued, message: null, error: null });
  }

  const sending = replaceEntry(current, localId, (candidate) => ({
    ...candidate,
    status: "sending",
    attempts: candidate.attempts + 1
  })) ?? entry;
  const delivery = current.send({
    topicId: sending.topicId,
    body: sending.body,
    replyToMessageId: sending.replyToMessageId,
    clientOperationId: sending.deliveryKey
  }).then(({ message }) => {
    removeEntry(current, localId);
    if (activeContext === current) current.onConfirmed(message);
    return { delivered: true, retryable: false, entry: sending, message, error: null };
  }).catch((error: unknown) => {
    if (!isRetryableFailure(error)) {
      removeEntry(current, localId);
      return { delivered: false, retryable: false, entry: sending, message: null, error };
    }
    const failed = replaceEntry(current, localId, (candidate) => ({ ...candidate, status: "failed" })) ?? sending;
    return { delivered: false, retryable: true, entry: failed, message: null, error };
  }).finally(() => {
    inFlight.delete(scopeKey);
  });
  inFlight.set(scopeKey, delivery);
  return delivery as Promise<QueuedTextDeliveryResult<TMessage>>;
}

export function removeQueuedMessage(localId: string) {
  const current = currentContext();
  if (current) removeEntry(current, localId);
}

export async function flushQueuedMessages() {
  const entries = getQueuedTextMessages();
  return Promise.allSettled(entries.map((entry) => retryQueuedMessage(entry.localId)));
}

export function clearCommunityOutboxForUser(userId: string, storage: Storage = localStorage) {
  writeOutbox(storage, readOutbox(storage).filter((entry) => entry.userId !== userId));
}

export function reconcileQueuedMessages<TMessage extends ConfirmedMessage>(messages: TMessage[]) {
  const current = currentContext();
  const unique = mergeConfirmedCommunityMessages<TMessage>([], messages);
  if (!current) return unique;
  const confirmedKeys = new Set(unique.map((message) => message.clientOperationId).filter(Boolean));
  if (!confirmedKeys.size) return unique;
  writeOutbox(
    current.storage,
    readOutbox(current.storage).filter((entry) =>
      entry.userId !== current.userId
      || entry.deviceId !== current.deviceId
      || !confirmedKeys.has(entry.deliveryKey)
    )
  );
  notifyChange(current);
  return unique;
}

export function mergeConfirmedCommunityMessages<TMessage extends ConfirmedMessage>(
  existing: TMessage[],
  incoming: TMessage[]
) {
  const merged: TMessage[] = [];
  const ids = new Set<string>();
  const operationIds = new Set<string>();
  for (const message of [...incoming, ...existing]) {
    const operationId = message.clientOperationId ?? null;
    if (ids.has(message.id) || (operationId && operationIds.has(operationId))) continue;
    ids.add(message.id);
    if (operationId) operationIds.add(operationId);
    merged.push(message);
  }
  return merged;
}
