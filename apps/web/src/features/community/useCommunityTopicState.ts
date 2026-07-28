import type { ClubMessage, ClubTopic, CommunityTopicState } from "@club/shared";
import { ref } from "vue";

type ObserverLike = {
  observe: (element: Element) => void;
  disconnect: () => void;
};

type UseCommunityTopicStateOptions = {
  markRead: (topicId: string, messageId: string) => Promise<CommunityTopicState>;
  debounceMs?: number;
  createObserver?: (callback: IntersectionObserverCallback) => ObserverLike;
  documentTarget?: Document;
};

export function useCommunityTopicState(options: UseCommunityTopicStateOptions) {
  const topicStates = ref<Record<string, CommunityTopicState>>({});
  const debounceMs = options.debounceMs ?? 400;
  const documentTarget = options.documentTarget ?? (typeof document === "undefined" ? null : document);
  let activeTopicId: string | null = null;
  let observer: ObserverLike | null = null;
  let debounceTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let pendingMessageId: string | null = null;
  let inFlightMessageId: string | null = null;
  let delivery: Promise<void> | null = null;
  let generation = 0;
  const positions = new Map<string, number>();
  const visibleIds = new Set<string>();
  const advancedPositions = new Map<string, number>();

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
    const position = state.lastReadMessageId ? positions.get(state.lastReadMessageId) : undefined;
    if (position !== undefined) advancedPositions.set(topicId, Math.max(advancedPositions.get(topicId) ?? -1, position));
  }

  function selectTopic(topicId: string, messages: ClubMessage[]) {
    observer?.disconnect();
    observer = null;
    visibleIds.clear();
    positions.clear();
    activeTopicId = topicId;
    [...messages]
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
      .forEach((message, index) => positions.set(message.id, index));
    const lastReadMessageId = topicStates.value[topicId]?.lastReadMessageId;
    const lastReadPosition = lastReadMessageId ? positions.get(lastReadMessageId) : undefined;
    if (lastReadPosition !== undefined) advancedPositions.set(topicId, lastReadPosition);
  }

  function clearDebounce() {
    if (!debounceTimer) return;
    globalThis.clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  async function flushRead() {
    clearDebounce();
    if (delivery) {
      await delivery;
      if (pendingMessageId) return flushRead();
      return;
    }
    const topicId = activeTopicId;
    const messageId = pendingMessageId;
    if (!topicId || !messageId) return;
    pendingMessageId = null;
    inFlightMessageId = messageId;
    const deliveryGeneration = generation;
    delivery = options.markRead(topicId, messageId)
      .then((state) => {
        if (generation === deliveryGeneration) syncAuthoritativeState(topicId, state);
      })
      .catch(() => {
        if (generation === deliveryGeneration && activeTopicId === topicId && !pendingMessageId) {
          pendingMessageId = messageId;
        }
      })
      .finally(() => {
        inFlightMessageId = null;
        delivery = null;
      });
    await delivery;
    if (pendingMessageId && pendingMessageId !== messageId) {
      debounceTimer = globalThis.setTimeout(() => {
        debounceTimer = null;
        void flushRead();
      }, debounceMs);
    }
  }

  function markVisibleMessageRead(messageId: string) {
    const topicId = activeTopicId;
    const position = positions.get(messageId);
    if (!topicId || position === undefined) return;
    const pendingPosition = pendingMessageId ? positions.get(pendingMessageId) ?? -1 : -1;
    const inFlightPosition = inFlightMessageId ? positions.get(inFlightMessageId) ?? -1 : -1;
    const furthest = Math.max(advancedPositions.get(topicId) ?? -1, pendingPosition, inFlightPosition);
    if (position <= furthest) return;
    pendingMessageId = messageId;
    clearDebounce();
    debounceTimer = globalThis.setTimeout(() => {
      debounceTimer = null;
      void flushRead();
    }, debounceMs);
  }

  function observeVisibleMessages(container: Element) {
    observer?.disconnect();
    visibleIds.clear();
    const createObserver = options.createObserver
      ?? ((callback: IntersectionObserverCallback) => new IntersectionObserver(callback, {
        root: container,
        threshold: 0.6
      }));
    if (typeof IntersectionObserver === "undefined" && !options.createObserver) return;
    observer = createObserver((entries) => {
      for (const entry of entries) {
        const id = entry.target.id.startsWith("chat-message-")
          ? entry.target.id.slice("chat-message-".length)
          : "";
        if (!positions.has(id)) continue;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) visibleIds.add(id);
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
    for (const element of container.querySelectorAll<HTMLElement>("[id^='chat-message-']")) {
      const id = element.id.slice("chat-message-".length);
      if (positions.has(id)) observer.observe(element);
    }
  }

  async function closeTopic() {
    observer?.disconnect();
    observer = null;
    visibleIds.clear();
    await flushRead();
    pendingMessageId = null;
    activeTopicId = null;
    positions.clear();
  }

  function handleVisibilityChange() {
    if (documentTarget?.visibilityState === "hidden") void flushRead();
  }

  function reset() {
    generation += 1;
    observer?.disconnect();
    observer = null;
    clearDebounce();
    activeTopicId = null;
    pendingMessageId = null;
    inFlightMessageId = null;
    positions.clear();
    visibleIds.clear();
    advancedPositions.clear();
    topicStates.value = {};
  }

  function dispose() {
    reset();
    documentTarget?.removeEventListener("visibilitychange", handleVisibilityChange);
  }

  documentTarget?.addEventListener("visibilitychange", handleVisibilityChange);

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
