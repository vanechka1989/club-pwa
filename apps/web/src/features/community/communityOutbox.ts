import type { CommunityMention } from "@club/shared";

export type QueuedTextMessage = {
  userId: string;
  deviceId: string;
  topicId: string;
  localId: string;
  deliveryKey: string;
  body: string;
  mentions: CommunityMention[];
  replyToMessageId: string | null;
  createdAt: number;
  sequence: number;
  status: "queued" | "sending" | "failed";
  attempts: number;
  nextAttemptAt: number;
};

export type QueueTextMessageInput = {
  topicId: string;
  body: string;
  mentions?: CommunityMention[];
  replyToMessageId?: string | null;
  localId?: string;
};

export type CommunityTextSendInput = {
  topicId: string;
  body: string;
  mentions: CommunityMention[];
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
  retryBaseMs?: number;
  retryMaximumMs?: number;
  retryJitter?: () => number;
  maximumConcurrency?: number;
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
const maximumStoredMessages = 1_000;
const maximumBodyLength = 3_000;
const maximumPersistedAttempts = 16;
let activeContext: Required<CommunityOutboxContext> | null = null;
const inFlight = new Map<string, Promise<QueuedTextDeliveryResult>>();
const topicTails = new Map<string, Promise<unknown>>();
const flushes = new WeakMap<Required<CommunityOutboxContext>, Promise<PromiseSettledResult<QueuedTextDeliveryResult>[]>>();
const retryTimers = new Map<string, ReturnType<typeof globalThis.setTimeout>>();
const deliveryCounts = new WeakMap<Required<CommunityOutboxContext>, number>();
const deliveryWaiters = new WeakMap<Required<CommunityOutboxContext>, Array<() => void>>();

function defaultIsOnline() {
  return typeof navigator === "undefined" || navigator.onLine;
}

function defaultLocalId() {
  return crypto.randomUUID();
}

function scopeKey(current: Pick<Required<CommunityOutboxContext>, "userId" | "deviceId">) {
  return `${current.userId}\u001f${current.deviceId}`;
}

function entryKey(current: Required<CommunityOutboxContext>, localId: string) {
  return `${scopeKey(current)}\u001f${localId}`;
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

function normalizeMentions(body: string, value: unknown): CommunityMention[] {
  if (!Array.isArray(value)) return [];
  const mentions: CommunityMention[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Partial<CommunityMention>;
    const start = candidate.start;
    const end = candidate.end;
    if (
      typeof candidate.userId !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.userId)
      || typeof candidate.displayName !== "string"
      || !candidate.displayName.trim()
      || candidate.displayName.length > 160
      || typeof start !== "number"
      || typeof end !== "number"
      || !Number.isInteger(start)
      || !Number.isInteger(end)
      || start < 0
      || end <= start
      || body.slice(start, end) !== `@${candidate.displayName}`
    ) {
      continue;
    }
    mentions.push({
      userId: candidate.userId,
      displayName: candidate.displayName,
      start,
      end
    });
  }
  return mentions
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .filter((mention, index, sorted) => index === 0 || mention.start >= sorted[index - 1]!.end);
}

function normalizeQueuedMessage(value: unknown, fallbackSequence: number): QueuedTextMessage | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<QueuedTextMessage>;
  if (!(typeof candidate.userId === "string" && candidate.userId.length > 0
    && typeof candidate.deviceId === "string" && candidate.deviceId.length > 0
    && typeof candidate.topicId === "string" && candidate.topicId.length > 0
    && typeof candidate.localId === "string" && candidate.localId.length > 0
    && typeof candidate.deliveryKey === "string"
    && candidate.deliveryKey === createDeliveryKey(candidate.deviceId, candidate.localId)
    && typeof candidate.body === "string" && candidate.body.length > 0 && candidate.body.length <= maximumBodyLength
    && (candidate.replyToMessageId === null || typeof candidate.replyToMessageId === "string")
    && typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt)
    && (candidate.status === "queued" || candidate.status === "sending" || candidate.status === "failed")
    && typeof candidate.attempts === "number" && Number.isInteger(candidate.attempts) && candidate.attempts >= 0)) {
    return null;
  }
  return {
    userId: candidate.userId,
    deviceId: candidate.deviceId,
    topicId: candidate.topicId,
    localId: candidate.localId,
    deliveryKey: candidate.deliveryKey,
    body: candidate.body,
    mentions: normalizeMentions(candidate.body, candidate.mentions),
    replyToMessageId: candidate.replyToMessageId,
    createdAt: candidate.createdAt,
    sequence: typeof candidate.sequence === "number" && Number.isSafeInteger(candidate.sequence) && candidate.sequence >= 0
      ? candidate.sequence
      : fallbackSequence,
    status: candidate.status === "sending" ? "queued" : candidate.status,
    attempts: Math.min(candidate.attempts, maximumPersistedAttempts),
    nextAttemptAt: typeof candidate.nextAttemptAt === "number" && Number.isFinite(candidate.nextAttemptAt)
      ? Math.max(0, candidate.nextAttemptAt)
      : 0
  };
}

function normalizeOutbox(values: unknown[]) {
  const unique = new Map<string, QueuedTextMessage>();
  for (const [index, value] of values.entries()) {
    const entry = normalizeQueuedMessage(value, values.length - index);
    if (!entry) continue;
    const key = `${entry.userId}\u001f${entry.deviceId}\u001f${entry.localId}`;
    const previous = unique.get(key);
    if (!previous || entry.createdAt >= previous.createdAt) unique.set(key, entry);
  }
  const namespaceCounts = new Map<string, number>();
  const bounded = [...unique.values()]
    .sort((left, right) => right.createdAt - left.createdAt || right.sequence - left.sequence)
    .filter((entry) => {
      const namespace = `${entry.userId}\u001f${entry.deviceId}`;
      const count = namespaceCounts.get(namespace) ?? 0;
      if (count >= maximumMessages) return false;
      namespaceCounts.set(namespace, count + 1);
      return true;
    })
    .slice(0, maximumStoredMessages)
    .sort((left, right) => left.createdAt - right.createdAt || left.sequence - right.sequence);
  const topicHeads = new Map<string, QueuedTextMessage>();
  return bounded.map((entry) => {
    const topicKey = `${entry.userId}\u001f${entry.deviceId}\u001f${entry.topicId}`;
    const head = topicHeads.get(topicKey);
    if (!head) {
      topicHeads.set(topicKey, entry);
      return entry;
    }
    if (head.status === "failed" && entry.status === "failed" && entry.nextAttemptAt < head.nextAttemptAt) {
      return { ...entry, nextAttemptAt: head.nextAttemptAt };
    }
    return entry;
  });
}

function removeStorageKey(storage: Storage) {
  try {
    storage.removeItem(storageKey);
  } catch {
    // Storage may be blocked in private mode.
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

function readOutbox(storage: Storage) {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      removeStorageKey(storage);
      return [];
    }
    const normalized = normalizeOutbox(parsed);
    if (JSON.stringify(normalized) !== raw) writeOutbox(storage, normalized);
    return normalized;
  } catch {
    removeStorageKey(storage);
    return [];
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
  writeOutbox(current.storage, normalizeOutbox(entries));
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

function clearRetryTimer(current: Required<CommunityOutboxContext>) {
  const key = scopeKey(current);
  const timer = retryTimers.get(key);
  if (timer) globalThis.clearTimeout(timer);
  retryTimers.delete(key);
}

function retryDelay(current: Required<CommunityOutboxContext>, attempts: number) {
  const exponential = Math.min(current.retryMaximumMs, current.retryBaseMs * (2 ** Math.max(0, attempts - 1)));
  return Math.max(0, Math.min(current.retryMaximumMs, Math.round(exponential * (1 + Math.max(0, current.retryJitter())))));
}

function scheduleRetry(current: Required<CommunityOutboxContext>) {
  if (activeContext !== current || !current.isOnline()) return;
  clearRetryTimer(current);
  const topicHeads = new Map<string, QueuedTextMessage>();
  for (const entry of scopedEntries(current)) {
    if (!topicHeads.has(entry.topicId)) topicHeads.set(entry.topicId, entry);
  }
  const next = [...topicHeads.values()]
    .filter((entry) => entry.status === "failed")
    .sort((left, right) => left.nextAttemptAt - right.nextAttemptAt)[0];
  if (!next) return;
  const key = scopeKey(current);
  retryTimers.set(key, globalThis.setTimeout(() => {
    retryTimers.delete(key);
    if (activeContext === current) void flushQueuedMessages();
  }, Math.max(0, next.nextAttemptAt - current.now())));
}

function acquireSlot(current: Required<CommunityOutboxContext>): Promise<void> | null {
  const activeDeliveries = deliveryCounts.get(current) ?? 0;
  if (activeDeliveries < current.maximumConcurrency) {
    deliveryCounts.set(current, activeDeliveries + 1);
    return null;
  }
  return new Promise<void>((resolve, reject) => {
    const waiters = deliveryWaiters.get(current) ?? [];
    waiters.push(() => {
      if (activeContext !== current) {
        reject(new Error("community_outbox_context_changed"));
        return;
      }
      deliveryCounts.set(current, (deliveryCounts.get(current) ?? 0) + 1);
      resolve();
    });
    deliveryWaiters.set(current, waiters);
  });
}

function releaseSlot(current: Required<CommunityOutboxContext>) {
  deliveryCounts.set(current, Math.max(0, (deliveryCounts.get(current) ?? 1) - 1));
  deliveryWaiters.get(current)?.shift()?.();
}

function cancelDeliveryWaiters(current: Required<CommunityOutboxContext>) {
  const waiters = deliveryWaiters.get(current) ?? [];
  deliveryWaiters.delete(current);
  for (const cancel of waiters) cancel();
}

async function deliverEntry(
  current: Required<CommunityOutboxContext>,
  localId: string
): Promise<QueuedTextDeliveryResult> {
  const original = scopedEntries(current).find((entry) => entry.localId === localId);
  if (!original) throw new Error("queued_community_message_not_found");
  if (activeContext !== current) {
    return { delivered: false, retryable: true, entry: original, message: null, error: null };
  }
  if (!current.isOnline()) {
    return { delivered: false, retryable: true, entry: original, message: null, error: null };
  }
  const slot = acquireSlot(current);
  if (slot) await slot;
  try {
    if (activeContext !== current) {
      return { delivered: false, retryable: true, entry: original, message: null, error: null };
    }
    const sending = replaceEntry(current, localId, (entry) => ({
      ...entry,
      status: "sending",
      attempts: Math.min(maximumPersistedAttempts, entry.attempts + 1),
      nextAttemptAt: 0
    })) ?? original;
    try {
      const { message } = await current.send({
        topicId: sending.topicId,
        body: sending.body,
        mentions: sending.mentions,
        replyToMessageId: sending.replyToMessageId,
        clientOperationId: sending.deliveryKey
      });
      removeEntry(current, localId);
      if (activeContext === current) current.onConfirmed(message);
      return { delivered: true, retryable: false, entry: sending, message, error: null };
    } catch (error) {
      if (!isRetryableFailure(error)) {
        removeEntry(current, localId);
        return { delivered: false, retryable: false, entry: sending, message: null, error };
      }
      const failed = replaceEntry(current, localId, (entry) => ({
        ...entry,
        status: "failed",
        nextAttemptAt: current.now() + retryDelay(current, entry.attempts)
      })) ?? sending;
      scheduleRetry(current);
      return { delivered: false, retryable: true, entry: failed, message: null, error };
    }
  } finally {
    releaseSlot(current);
  }
}

function scheduleEntry(current: Required<CommunityOutboxContext>, entry: QueuedTextMessage) {
  const key = entryKey(current, entry.localId);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const topicKey = `${scopeKey(current)}\u001f${entry.topicId}`;
  const previous = topicTails.get(topicKey);
  const delivery = previous
    ? previous.catch(() => undefined).then(() => deliverEntry(current, entry.localId))
    : deliverEntry(current, entry.localId);
  topicTails.set(topicKey, delivery);
  inFlight.set(key, delivery);
  void delivery.finally(() => {
    inFlight.delete(key);
    if (topicTails.get(topicKey) === delivery) topicTails.delete(topicKey);
  }).catch(() => undefined);
  return delivery;
}

export function createDeliveryKey(deviceId: string, localId: string) {
  return `${deviceId}:${localId}`;
}

export function configureCommunityOutbox<TMessage extends ConfirmedMessage>(input: CommunityOutboxContext<TMessage>) {
  const previousContext = activeContext;
  if (previousContext) clearRetryTimer(previousContext);
  const nextContext: Required<CommunityOutboxContext> = {
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
    onConfirmed: (message) => input.onConfirmed?.(message as TMessage),
    retryBaseMs: input.retryBaseMs ?? 1_000,
    retryMaximumMs: input.retryMaximumMs ?? 30_000,
    retryJitter: input.retryJitter ?? Math.random,
    maximumConcurrency: Math.max(1, Math.min(4, input.maximumConcurrency ?? 3))
  };
  activeContext = nextContext;
  if (previousContext) cancelDeliveryWaiters(previousContext);
  notifyChange(activeContext);
  scheduleRetry(activeContext);
}

export function resetCommunityOutbox() {
  const previousContext = activeContext;
  if (previousContext) clearRetryTimer(previousContext);
  activeContext = null;
  if (previousContext) cancelDeliveryWaiters(previousContext);
  inFlight.clear();
  topicTails.clear();
}

export function getQueuedTextMessages(topicId?: string) {
  const current = currentContext();
  if (!current) return [];
  return scopedEntries(current)
    .filter((entry) => !topicId || entry.topicId === topicId)
    .sort((left, right) => left.createdAt - right.createdAt || left.sequence - right.sequence);
}

export async function queueTextMessage<TMessage extends ConfirmedMessage = ConfirmedMessage>(
  input: QueueTextMessageInput
): Promise<QueuedTextDeliveryResult<TMessage>> {
  const current = currentContext();
  if (!current) throw new Error("community_outbox_not_configured");
  const body = input.body.trim();
  if (!body || body.length > maximumBodyLength || !input.topicId) throw new Error("invalid_community_text_message");
  const localId = input.localId ?? current.createLocalId();
  const allEntries = readOutbox(current.storage);
  const existingScope = allEntries.filter((candidate) =>
    candidate.userId === current.userId && candidate.deviceId === current.deviceId
  );
  const existing = existingScope.find((entry) => entry.localId === localId);
  const entry: QueuedTextMessage = existing ?? {
    userId: current.userId,
    deviceId: current.deviceId,
    topicId: input.topicId,
    localId,
    deliveryKey: createDeliveryKey(current.deviceId, localId),
    body,
    mentions: normalizeMentions(body, input.mentions),
    replyToMessageId: input.replyToMessageId ?? null,
    createdAt: current.now(),
    sequence: Math.max(0, ...existingScope.map((candidate) => candidate.sequence)) + 1,
    status: "queued",
    attempts: 0,
    nextAttemptAt: 0
  };
  if (!existing) {
    const otherScopes = allEntries.filter((candidate) =>
      candidate.userId !== current.userId || candidate.deviceId !== current.deviceId
    );
    const currentScope = [entry, ...existingScope]
      .sort((left, right) => right.createdAt - left.createdAt || right.sequence - left.sequence)
      .slice(0, maximumMessages);
    const normalized = normalizeOutbox([...currentScope, ...otherScopes]);
    writeOutbox(current.storage, normalized);
    if (activeContext === current) {
      current.onChange(normalized.filter((candidate) =>
        candidate.userId === current.userId && candidate.deviceId === current.deviceId
      ));
    }
  }
  return retryQueuedMessage(localId) as Promise<QueuedTextDeliveryResult<TMessage>>;
}

export function retryQueuedMessage<TMessage extends ConfirmedMessage = ConfirmedMessage>(
  localId: string
): Promise<QueuedTextDeliveryResult<TMessage>> {
  const current = currentContext();
  if (!current) return Promise.reject(new Error("community_outbox_not_configured"));
  const entries = scopedEntries(current).sort((left, right) => left.createdAt - right.createdAt || left.sequence - right.sequence);
  const target = entries.find((entry) => entry.localId === localId);
  if (!target) return Promise.reject(new Error("queued_community_message_not_found"));
  const predecessors = entries.filter((entry) =>
    entry.topicId === target.topicId
    && (entry.createdAt < target.createdAt || (entry.createdAt === target.createdAt && entry.sequence <= target.sequence))
  );
  if (predecessors.length === 1) {
    return scheduleEntry(current, target) as Promise<QueuedTextDeliveryResult<TMessage>>;
  }
  return (async () => {
    for (const entry of predecessors) {
      if (entry.localId !== target.localId && entry.status === "failed" && entry.nextAttemptAt > current.now()) {
        return { delivered: false, retryable: true, entry: target, message: null, error: null };
      }
      const result = await scheduleEntry(current, entry);
      if (entry.localId === target.localId) return result;
      if (!result.delivered && result.retryable) {
        return { delivered: false, retryable: true, entry: target, message: null, error: result.error };
      }
    }
    return { delivered: false, retryable: true, entry: target, message: null, error: null };
  })() as Promise<QueuedTextDeliveryResult<TMessage>>;
}

export function removeQueuedMessage(localId: string) {
  const current = currentContext();
  if (current) removeEntry(current, localId);
}

export function flushQueuedMessages() {
  const current = currentContext();
  if (!current) return Promise.resolve([] as PromiseSettledResult<QueuedTextDeliveryResult>[]);
  const active = flushes.get(current);
  if (active) return active;
  clearRetryTimer(current);
  const topics = new Map<string, QueuedTextMessage[]>();
  for (const entry of getQueuedTextMessages()) {
    const topicEntries = topics.get(entry.topicId) ?? [];
    topicEntries.push(entry);
    topics.set(entry.topicId, topicEntries);
  }
  const topicWorkers = [...topics.values()].map(async (entries) => {
    const results: PromiseSettledResult<QueuedTextDeliveryResult>[] = [];
    for (const entry of entries) {
      if (entry.status === "failed" && entry.nextAttemptAt > current.now()) break;
      try {
        const result = await scheduleEntry(current, entry);
        results.push({ status: "fulfilled", value: result });
        if (!result.delivered && result.retryable) break;
      } catch (reason) {
        results.push({ status: "rejected", reason });
        if (activeContext !== current) break;
      }
    }
    return results;
  });
  const flush = Promise.all(topicWorkers).then((results) => results.flat()).finally(() => {
    if (flushes.get(current) === flush) flushes.delete(current);
    scheduleRetry(current);
  });
  flushes.set(current, flush);
  return flush;
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
