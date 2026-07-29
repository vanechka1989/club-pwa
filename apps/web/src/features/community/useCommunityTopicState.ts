import type { ClubMessage, ClubTopic, CommunityTopicState } from "@club/shared";
import { ref } from "vue";
import { compareCommunityMessageTupleAscending } from "./communityViewModel";

type ObserverLike = {
  observe: (element: Element) => void;
  disconnect: () => void;
};

type UseCommunityTopicStateOptions = {
  markRead: (topicId: string, messageId: string) => Promise<CommunityTopicState>;
  debounceMs?: number;
  retryBaseMs?: number;
  retryMaximumMs?: number;
  createObserver?: (callback: IntersectionObserverCallback) => ObserverLike;
  documentTarget?: Document;
  windowTarget?: Window;
  now?: () => number;
};

type PendingRead = {
  messageId: string;
  attempts: number;
  nextAttemptAt: number;
  generation: number;
};

export function useCommunityTopicState(options: UseCommunityTopicStateOptions) {
  const topicStates = ref<Record<string, CommunityTopicState>>({});
  const debounceMs = options.debounceMs ?? 400;
  const retryBaseMs = options.retryBaseMs ?? 1_000;
  const retryMaximumMs = options.retryMaximumMs ?? 30_000;
  const now = options.now ?? Date.now;
  const documentTarget = options.documentTarget ?? (typeof document === "undefined" ? null : document);
  const windowTarget = options.windowTarget ?? (typeof window === "undefined" ? null : window);
  let activeTopicId: string | null = null;
  let observer: ObserverLike | null = null;
  let debounceTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let retryTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let generation = 0;
  const positions = new Map<string, number>();
  const visibleIds = new Set<string>();
  const advancedPositions = new Map<string, number>();
  const pendingReads = new Map<string, PendingRead>();
  const inFlightReads = new Map<string, string>();
  const deliveries = new Map<string, Promise<void>>();

  function syncTopics(topics: ClubTopic[]) {
    const next: Record<string, CommunityTopicState> = {};
    for (const topic of topics) {
      next[topic.id] = {
        unreadCount: topic.unreadCount,
        lastReadMessageId: topicStates.value[topic.id]?.lastReadMessageId ?? null,
        notificationMode: topic.notificationMode
      };
    }
    topicStates.value = next;
  }

  function syncAuthoritativeState(topicId: string, state: CommunityTopicState) {
    topicStates.value = { ...topicStates.value, [topicId]: state };
    if (topicId !== activeTopicId) return;
    const position = state.lastReadMessageId ? positions.get(state.lastReadMessageId) : undefined;
    if (position !== undefined) {
      advancedPositions.set(topicId, Math.max(advancedPositions.get(topicId) ?? -1, position));
      const pending = pendingReads.get(topicId);
      const pendingPosition = pending ? positions.get(pending.messageId) : undefined;
      if (pendingPosition !== undefined && position >= pendingPosition) pendingReads.delete(topicId);
    }
  }

  function clearDebounce() {
    if (!debounceTimer) return;
    globalThis.clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  function clearRetryTimer() {
    if (!retryTimer) return;
    globalThis.clearTimeout(retryTimer);
    retryTimer = null;
  }

  function retryDelay(attempts: number) {
    return Math.min(retryMaximumMs, retryBaseMs * (2 ** Math.max(0, attempts - 1)));
  }

  function scheduleRetry() {
    clearRetryTimer();
    const next = [...pendingReads.entries()]
      .filter(([, pending]) => pending.generation === generation)
      .sort((left, right) => left[1].nextAttemptAt - right[1].nextAttemptAt)[0];
    if (!next) return;
    retryTimer = globalThis.setTimeout(() => {
      retryTimer = null;
      void attemptRead(next[0], false);
    }, Math.max(0, next[1].nextAttemptAt - now()));
  }

  async function attemptRead(topicId: string, force: boolean) {
    const existing = deliveries.get(topicId);
    if (existing) {
      await existing;
      return;
    }
    const pending = pendingReads.get(topicId);
    if (!pending || pending.generation !== generation) return;
    if (!force && pending.nextAttemptAt > now()) {
      scheduleRetry();
      return;
    }
    const deliveryGeneration = generation;
    const messageId = pending.messageId;
    inFlightReads.set(topicId, messageId);
    const delivery = options.markRead(topicId, messageId)
      .then((state) => {
        if (generation !== deliveryGeneration) return;
        syncAuthoritativeState(topicId, state);
        const current = pendingReads.get(topicId);
        if (current?.messageId === messageId) pendingReads.delete(topicId);
      })
      .catch(() => {
        if (generation !== deliveryGeneration) return;
        const current = pendingReads.get(topicId);
        if (!current || current.messageId !== messageId) return;
        const attempts = current.attempts + 1;
        pendingReads.set(topicId, {
          ...current,
          attempts,
          nextAttemptAt: now() + retryDelay(attempts)
        });
      })
      .finally(() => {
        if (deliveries.get(topicId) === delivery) deliveries.delete(topicId);
        if (inFlightReads.get(topicId) === messageId) inFlightReads.delete(topicId);
        if (generation === deliveryGeneration) scheduleRetry();
      });
    deliveries.set(topicId, delivery);
    await delivery;
  }

  function selectTopic(topicId: string, messages: ClubMessage[]) {
    observer?.disconnect();
    observer = null;
    clearDebounce();
    visibleIds.clear();
    positions.clear();
    activeTopicId = topicId;
    [...messages]
      .sort(compareCommunityMessageTupleAscending)
      .forEach((message, index) => positions.set(message.id, index));
    const lastReadMessageId = topicStates.value[topicId]?.lastReadMessageId;
    const lastReadPosition = lastReadMessageId ? positions.get(lastReadMessageId) : undefined;
    if (lastReadPosition !== undefined) advancedPositions.set(topicId, lastReadPosition);
    const retained = pendingReads.get(topicId);
    if (retained?.generation === generation) {
      retained.nextAttemptAt = 0;
      void attemptRead(topicId, true);
    }
  }

  async function flushRead() {
    clearDebounce();
    const topicId = activeTopicId;
    if (topicId) await attemptRead(topicId, true);
  }

  function markVisibleMessageRead(messageId: string) {
    const topicId = activeTopicId;
    const position = positions.get(messageId);
    if (!topicId || position === undefined) return;
    const pending = pendingReads.get(topicId);
    const pendingPosition = pending ? positions.get(pending.messageId) ?? -1 : -1;
    const inFlightId = inFlightReads.get(topicId);
    const inFlightPosition = inFlightId ? positions.get(inFlightId) ?? -1 : -1;
    const furthest = Math.max(advancedPositions.get(topicId) ?? -1, pendingPosition, inFlightPosition);
    if (position <= furthest) return;
    pendingReads.set(topicId, { messageId, attempts: 0, nextAttemptAt: 0, generation });
    clearDebounce();
    debounceTimer = globalThis.setTimeout(() => {
      debounceTimer = null;
      void attemptRead(topicId, true);
    }, debounceMs);
  }

  function observeVisibleMessages(container: Element) {
    observer?.disconnect();
    visibleIds.clear();
    const createObserver = options.createObserver
      ?? ((callback: IntersectionObserverCallback) => new IntersectionObserver(callback, {
        root: container,
        threshold: 0.01
      }));
    if (typeof IntersectionObserver === "undefined" && !options.createObserver) return;
    observer = createObserver((entries) => {
      for (const entry of entries) {
        const id = entry.target instanceof HTMLElement
          ? entry.target.dataset.communityReadEnd ?? ""
          : "";
        if (!positions.has(id)) continue;
        if (entry.isIntersecting) visibleIds.add(id);
        else visibleIds.delete(id);
      }
      let newestId: string | null = null;
      let newestPosition = -1;
      for (const id of visibleIds) {
        const position = positions.get(id) ?? -1;
        if (position > newestPosition) {
          newestId = id;
          newestPosition = position;
        }
      }
      if (newestId) markVisibleMessageRead(newestId);
    });
    for (const element of container.querySelectorAll<HTMLElement>("[data-community-read-end]")) {
      const id = element.dataset.communityReadEnd ?? "";
      if (positions.has(id)) observer.observe(element);
    }
  }

  function closeTopic() {
    const closingTopicId = activeTopicId;
    observer?.disconnect();
    observer = null;
    clearDebounce();
    visibleIds.clear();
    activeTopicId = null;
    positions.clear();
    return closingTopicId ? attemptRead(closingTopicId, true) : Promise.resolve();
  }

  function retryPendingReads() {
    clearRetryTimer();
    for (const pending of pendingReads.values()) pending.nextAttemptAt = 0;
    for (const topicId of pendingReads.keys()) void attemptRead(topicId, true);
  }

  function handleVisibilityChange() {
    if (documentTarget?.visibilityState === "hidden") void flushRead();
    else if (documentTarget?.visibilityState === "visible") retryPendingReads();
  }

  function reset() {
    generation += 1;
    observer?.disconnect();
    observer = null;
    clearDebounce();
    clearRetryTimer();
    activeTopicId = null;
    positions.clear();
    visibleIds.clear();
    advancedPositions.clear();
    pendingReads.clear();
    inFlightReads.clear();
    deliveries.clear();
    topicStates.value = {};
  }

  function dispose() {
    reset();
    documentTarget?.removeEventListener("visibilitychange", handleVisibilityChange);
    windowTarget?.removeEventListener("online", retryPendingReads);
  }

  documentTarget?.addEventListener("visibilitychange", handleVisibilityChange);
  windowTarget?.addEventListener("online", retryPendingReads);

  return {
    topicStates,
    syncTopics,
    syncAuthoritativeState,
    selectTopic,
    observeVisibleMessages,
    markVisibleMessageRead,
    flushRead,
    closeTopic,
    reset,
    dispose
  };
}
