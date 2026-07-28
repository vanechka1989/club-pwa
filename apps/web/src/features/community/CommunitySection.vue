<script setup lang="ts">
import "./community.css";
import "./communityRoute.css";
import type { ClubMessage, ClubTopic } from "@club/shared";
import { Lock, Plus } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  createClubMessage,
  createClubVoiceMessage,
  createClubImageMessage,
  createClubPoll,
  voteInClubPoll,
  closeClubPoll,
  createCommunityEventSource,
  createCommunityTopic,
  createTopicUserMute,
  deleteTopicAuthorMessages,
  deleteTopicMessages,
  getClubMessages,
  getCommunityTopics,
  markCommunityTopicRead,
  reactToClubMessage,
  setClubMessagePinned,
  revokeTopicUserMute,
  updateClubTopicSettings,
  updateModerationStatus
} from "@/api/client";
import ConfirmDialog from "@/features/app/ConfirmDialog.vue";
import { UiPageHeader } from "@/features/ui";
import { useI18n } from "@/features/app/i18n";
import { useNotificationsStore } from "@/stores/notifications";
import { useAppDialogsStore } from "@/stores/appDialogs";
import { useSessionStore } from "@/stores/session";
import { hasAdminCapability } from "@/features/admin/adminCapabilities";
import ChatRoom from "./ChatRoom.vue";
import ChatTopicList from "./ChatTopicList.vue";
import { configureCommunityDrafts, loadDraft, resetCommunityDrafts, saveDraft } from "./communityDrafts";
import {
  configureCommunityOutbox,
  flushQueuedMessages,
  getQueuedTextMessages,
  mergeConfirmedCommunityMessages,
  queueTextMessage,
  reconcileQueuedMessages,
  resetCommunityOutbox,
  type QueuedTextMessage
} from "./communityOutbox";
import { authorName, type ChatPollDraft, type VisibleMessageReaction } from "./communityViewModel";
import { useCommunityTopicState } from "./useCommunityTopicState";

const { t } = useI18n();
const session = useSessionStore();
const notifications = useNotificationsStore();
const appDialogs = useAppDialogsStore();

const emit = defineEmits<{
  chatOpenChange: [isOpen: boolean];
}>();

const topics = ref<ClubTopic[]>([]);
const messages = ref<ClubMessage[]>([]);
const queuedTextMessages = ref<QueuedTextMessage[]>([]);
const messagesNextCursor = ref<string | null>(null);
const loadingOlderMessages = ref(false);
const messagePageInitialized = ref(false);
const hasLoadedOlderMessages = ref(false);
const selectedTopic = ref<ClubTopic | null>(null);
const loading = ref(false);
const mutedUntil = ref<string | null>(null);
const mutedPermanently = ref(false);
const newMessage = ref("");
const newTopicTitle = ref("");
const newTopicAdminOnly = ref(false);
const showCreateTopic = ref(false);
const replyToMessage = ref<ClubMessage | null>(null);
const activeModerationMessageId = ref<string | null>(null);
const messageSaving = ref(false);
const topicSaving = ref(false);
const communityError = ref<string | null>(null);
const showDeleteTopicMessagesConfirm = ref(false);
const deleteTopicMessagesBusy = ref(false);
const composerResetVersion = ref(0);
const reactionCompletedVersion = ref(0);
const interactionResetVersion = ref(0);
const chatRoom = ref<{
  getMessagesElement: () => HTMLElement | null;
  scrollToBottom: () => Promise<void>;
} | null>(null);
const muteAlertShown = ref(false);
let realtimeFallbackTimer: ReturnType<typeof globalThis.setInterval> | null = null;
let realtimeSyncTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let communityEventSource: EventSource | null = null;
let realtimeConnected = false;
let refreshInFlight = false;
let refreshSelectedTopicQueued = false;
let topicsRefreshInFlight = false;
let lastCommunityErrorNotification: { text: string; shownAt: number } | null = null;
const communityDeviceStorageKey = "club-community-device-id-v1";
const isModerator = computed(() =>
  hasAdminCapability(session.user?.role, session.user?.adminPermissions, "community")
);
const isOwner = computed(() => session.user?.role === "owner");
const hasCommunityAccess = computed(() => isModerator.value || session.user?.membershipStatus === "active");
const isMuted = computed(() => mutedPermanently.value || Boolean(mutedUntil.value));
const activeModerationMessage = computed(
  () => messages.value.find((message) => message.id === activeModerationMessageId.value) ?? null
);
const activeTopics = computed(() => topics.value.filter((topic) => topic.isPublished));
const archivedTopics = computed(() => topics.value.filter((topic) => !topic.isPublished && topic.archivedUntil));
const canWrite = computed(
  () =>
    hasCommunityAccess.value &&
    selectedTopic.value &&
    (!selectedTopic.value.isLocked || isModerator.value) &&
    selectedTopic.value.isPublished &&
    !isMuted.value
);
const muteComposerText = computed(() => {
  if (mutedPermanently.value) {
    return "Бессрочный мут. Вы пока не можете писать в чат.";
  }

  if (mutedUntil.value) {
    return `Мут до ${new Date(mutedUntil.value).toLocaleString("ru-RU")}. Вы пока не можете писать в чат.`;
  }

  return "";
});
const unavailableComposerText = computed(() => {
  if (isMuted.value) return muteComposerText.value;
  if (selectedTopic.value?.isLocked && !isModerator.value) {
    return "Тема закрыта. Новые сообщения недоступны.";
  }
  return "Отправка сообщений сейчас недоступна.";
});
function closeModerationSheet() {
  activeModerationMessageId.value = null;
}

function getCommunityDeviceId() {
  try {
    const stored = localStorage.getItem(communityDeviceStorageKey);
    if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) {
      return stored;
    }
    const created = crypto.randomUUID();
    localStorage.setItem(communityDeviceStorageKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

const communityDeviceId = getCommunityDeviceId();

function hasNewReplyToMe(topic: ClubTopic) {
  return Boolean(topic.latestReplyToMeAt && topic.unreadCount > 0);
}

function applyAuthoritativeTopicState(
  topicId: string,
  state: { unreadCount: number; notificationMode: ClubTopic["notificationMode"] }
) {
  topics.value = topics.value.map((topic) => topic.id === topicId ? { ...topic, ...state } : topic);
  if (selectedTopic.value?.id === topicId) {
    selectedTopic.value = { ...selectedTopic.value, ...state };
  }
}

const topicState = useCommunityTopicState({
  markRead: async (topicId, messageId) => {
    const state = await markCommunityTopicRead(topicId, messageId);
    applyAuthoritativeTopicState(topicId, state);
    return state;
  }
});

function isOptimisticMessage(message: ClubMessage) {
  return message.id.startsWith("local:");
}

function optimisticMessage(entry: QueuedTextMessage): ClubMessage | null {
  const viewer = session.user;
  if (!viewer) return null;
  return {
    id: `local:${entry.deliveryKey}`,
    topicId: entry.topicId,
    body: entry.body,
    kind: "text",
    voice: null,
    images: [],
    video: null,
    document: null,
    poll: null,
    isSystem: false,
    status: "visible",
    author: {
      id: viewer.id,
      telegramId: viewer.telegramId,
      firstName: viewer.firstName,
      username: viewer.username,
      displayName: viewer.displayName,
      photoUrl: viewer.photoUrl,
      avatarPositionX: viewer.avatarPositionX,
      avatarPositionY: viewer.avatarPositionY,
      avatarScale: viewer.avatarScale
    },
    replyTo: null,
    likesCount: 0,
    dislikesCount: 0,
    reactionCounts: [],
    myReaction: null,
    authorMute: null,
    pinnedAt: null,
    editedAt: null,
    deletedByUserAt: null,
    clientOperationId: entry.deliveryKey,
    mentions: [],
    createdAt: new Date(entry.createdAt).toISOString()
  };
}

function mergeOptimisticMessages(serverMessages: ClubMessage[]) {
  const optimistic = queuedTextMessages.value
    .filter((entry) => entry.topicId === selectedTopic.value?.id)
    .map(optimisticMessage)
    .filter((message): message is ClubMessage => Boolean(message));
  return mergeConfirmedCommunityMessages([], [...optimistic, ...serverMessages]);
}

function syncQueuedMessages(entries = getQueuedTextMessages()) {
  queuedTextMessages.value = entries;
  if (selectedTopic.value) {
    messages.value = mergeOptimisticMessages(messages.value.filter((message) => !isOptimisticMessage(message)));
  }
}

function appendConfirmedTextMessage(message: ClubMessage) {
  const serverMessages = messages.value.filter((item) => !isOptimisticMessage(item));
  const isNewConfirmation = !serverMessages.some((item) =>
    item.id === message.id
    || Boolean(item.clientOperationId && item.clientOperationId === message.clientOperationId)
  );
  messages.value = mergeOptimisticMessages(mergeConfirmedCommunityMessages(serverMessages, [message]));
  if (isNewConfirmation && selectedTopic.value?.id === message.topicId) {
    selectedTopic.value = { ...selectedTopic.value, messagesCount: selectedTopic.value.messagesCount + 1 };
    topics.value = topics.value.map((topic) => topic.id === message.topicId ? selectedTopic.value! : topic);
  }
  void scrollToBottom();
}

function configurePersistedCommunityState(userId: string) {
  configureCommunityDrafts({ userId, deviceId: communityDeviceId });
  configureCommunityOutbox<ClubMessage>({
    userId,
    deviceId: communityDeviceId,
    send: async (input) => createClubMessage(input.topicId, input.body, input.replyToMessageId, {
      clientOperationId: input.clientOperationId
    }),
    onChange: syncQueuedMessages,
    onConfirmed: appendConfirmedTextMessage
  });
}

async function refreshReadObservation() {
  if (!selectedTopic.value) return;
  const serverMessages = messages.value.filter((message) => !isOptimisticMessage(message));
  topicState.selectTopic(selectedTopic.value.id, serverMessages);
  await nextTick();
  const element = chatRoom.value?.getMessagesElement();
  if (element) topicState.observeVisibleMessages(element);
}

function getErrorStatus(reason: unknown) {
  if (typeof reason !== "object" || !reason) {
    return null;
  }

  if ("status" in reason && typeof reason.status === "number") {
    return reason.status;
  }

  if ("statusCode" in reason && typeof reason.statusCode === "number") {
    return reason.statusCode;
  }

  if ("response" in reason && typeof reason.response === "object" && reason.response && "status" in reason.response) {
    return typeof reason.response.status === "number" ? reason.response.status : null;
  }

  return null;
}

function clearCommunityError() {
  communityError.value = null;
}

function showCommunityError(text: string) {
  communityError.value = text;
  const now = Date.now();
  if (!lastCommunityErrorNotification || lastCommunityErrorNotification.text !== text || now - lastCommunityErrorNotification.shownAt > 10_000) {
    notifications.showError(text);
    lastCommunityErrorNotification = { text, shownAt: now };
  }
}

function showMuteAlert() {
  const message = mutedPermanently.value
    ? "На вас наложен бессрочный мут. Вы пока не можете писать в чат."
    : `На вас наложен мут до ${mutedUntil.value ? new Date(mutedUntil.value).toLocaleString("ru-RU") : ""}. Вы пока не можете писать в чат.`;

  notifications.showError(message);
}

function startReply(message: ClubMessage) {
  replyToMessage.value = message;
  newMessage.value = newMessage.value || "";
}

async function scrollToBottom() {
  await nextTick();
  await chatRoom.value?.scrollToBottom();
}

function isNearBottom() {
  const element = chatRoom.value?.getMessagesElement();
  if (!element) {
    return true;
  }

  return element.scrollHeight - element.scrollTop - element.clientHeight < 96;
}

function messageSignature(message: ClubMessage) {
  return [
    message.id,
    message.status,
    message.body,
    message.kind,
    message.voice?.url ?? "",
    message.voice?.deletedAt ?? "",
    message.images.map((image) => `${image.id}:${image.url ?? ""}:${image.deletedAt ?? ""}`).join("|"),
    message.poll ? `${message.poll.id}:${message.poll.closedAt ?? ""}:${message.poll.options.map((option) => `${option.id}:${option.votesCount}:${option.selected}`).join("|")}` : "",
    message.createdAt,
    message.author.photoUrl ?? "",
    message.author.avatarPositionX ?? "",
    message.author.avatarPositionY ?? "",
    message.author.avatarScale ?? "",
    message.likesCount,
    message.dislikesCount,
    message.reactionCounts.map((reaction) => `${reaction.reaction}:${reaction.count}`).join(","),
    message.myReaction ?? "",
    message.authorMute?.id ?? "",
    message.authorMute?.kind ?? "",
    message.authorMute?.expiresAt ?? "",
    message.replyTo?.id ?? "",
    message.replyTo?.body ?? "",
    message.pinnedAt ?? ""
  ].join("\u001f");
}

async function handleTogglePin(message: ClubMessage) {
  try {
    const response = await setClubMessagePinned(message.id, !message.pinnedAt);
    messages.value = messages.value.map((item) => (item.id === response.message.id ? response.message : item));
    activeModerationMessageId.value = null;
  } catch (error) {
    if (getErrorStatus(error) === 409) {
      activeModerationMessageId.value = null;
      notifications.showInfo("Можно закрепить не больше 5 сообщений.");
      return;
    }
    showCommunityError(error instanceof Error ? error.message : "Не удалось изменить закрепление.");
  }
}

function messagesSignature(nextMessages: ClubMessage[]) {
  return nextMessages.map(messageSignature).join("\u001e");
}

async function refreshSelectedTopic({ keepScroll = true, silent = false } = {}) {
  if (!hasCommunityAccess.value || !selectedTopic.value) {
    return;
  }
  if (refreshInFlight) {
    refreshSelectedTopicQueued = true;
    return;
  }

  refreshInFlight = true;
  const scrollElement = chatRoom.value?.getMessagesElement();
  const previousScrollTop = scrollElement?.scrollTop ?? 0;
  const previousScrollHeight = scrollElement?.scrollHeight ?? 0;
  const shouldScroll = !keepScroll || isNearBottom();
  try {
    const response = await getClubMessages(selectedTopic.value.id);
    const retainedOlderMessages = hasLoadedOlderMessages.value
      ? messages.value.filter((message) => !response.messages.some((recent) => recent.id === message.id))
      : [];
    const confirmedMessages = reconcileQueuedMessages(response.messages);
    const nextMessages = mergeOptimisticMessages([...confirmedMessages, ...retainedOlderMessages]);
    const messagesChanged = messagesSignature(messages.value) !== messagesSignature(nextMessages);
    if (messagesChanged) {
      messages.value = nextMessages;
    }
    if (!messagePageInitialized.value) {
      messagesNextCursor.value = response.nextCursor ?? null;
      messagePageInitialized.value = true;
    }
    mutedUntil.value = response.mutedUntil;
    mutedPermanently.value = response.mutedPermanently;

    if (!messagesChanged) {
      await refreshReadObservation();
      return;
    }

    if (shouldScroll) {
      await scrollToBottom();
    } else if (scrollElement) {
      await nextTick();
      scrollElement.scrollTop = previousScrollTop + (scrollElement.scrollHeight - previousScrollHeight);
    }
    await refreshReadObservation();
  } catch {
    if (!silent) {
      showCommunityError("Не удалось обновить чат.");
    }
  } finally {
    refreshInFlight = false;
    if (refreshSelectedTopicQueued) {
      refreshSelectedTopicQueued = false;
      void refreshSelectedTopic({ keepScroll: true, silent: true });
    }
  }
}

async function loadOlderMessages() {
  if (!selectedTopic.value || !messagesNextCursor.value || loadingOlderMessages.value) return;
  loadingOlderMessages.value = true;
  try {
    const response = await getClubMessages(selectedTopic.value.id, messagesNextCursor.value);
    hasLoadedOlderMessages.value = true;
    const existingIds = new Set(messages.value.map((message) => message.id));
    messages.value = [...messages.value, ...response.messages.filter((message) => !existingIds.has(message.id))];
    messagesNextCursor.value = response.nextCursor ?? null;
  } catch {
    showCommunityError("Не удалось загрузить предыдущие сообщения.");
  } finally {
    loadingOlderMessages.value = false;
  }
}

async function loadTopics({ showLoading = false } = {}) {
  if (!hasCommunityAccess.value || topicsRefreshInFlight) {
    return;
  }

  topicsRefreshInFlight = true;
  loading.value = showLoading;
  clearCommunityError();
  try {
    const response = await getCommunityTopics();
    topics.value = response.topics;
    topicState.syncTopics(response.topics);
    if (selectedTopic.value) {
      selectedTopic.value = response.topics.find((topic) => topic.id === selectedTopic.value?.id) ?? selectedTopic.value;
    }
  } catch (reason) {
    if (getErrorStatus(reason) === 403) {
      topics.value = [];
      selectedTopic.value = null;
      clearCommunityError();
      return;
    }

    showCommunityError("Не удалось загрузить общение.");
  } finally {
    loading.value = false;
    topicsRefreshInFlight = false;
  }
}

function stopRealtimeFallback() {
  if (realtimeFallbackTimer) {
    globalThis.clearInterval(realtimeFallbackTimer);
    realtimeFallbackTimer = null;
  }
}

function startRealtimeFallback() {
  stopRealtimeFallback();
  realtimeFallbackTimer = globalThis.setInterval(() => {
    if (document.visibilityState !== "visible") {
      return;
    }
    if (selectedTopic.value) {
      void refreshSelectedTopic({ silent: true });
    } else {
      void loadTopics();
    }
  }, 5000);
}

function stopCommunityRealtime() {
  if (communityEventSource) {
    communityEventSource.close();
    communityEventSource = null;
  }
  realtimeConnected = false;
  if (realtimeSyncTimer) {
    globalThis.clearTimeout(realtimeSyncTimer);
    realtimeSyncTimer = null;
  }
}

function scheduleRealtimeSync() {
  if (!hasCommunityAccess.value || document.visibilityState !== "visible") {
    return;
  }
  if (realtimeSyncTimer) {
    globalThis.clearTimeout(realtimeSyncTimer);
  }
  realtimeSyncTimer = globalThis.setTimeout(() => {
    realtimeSyncTimer = null;
    if (selectedTopic.value) {
      void refreshSelectedTopic({ silent: true });
      return;
    }
    void loadTopics();
  }, 80);
}

function startCommunityRealtime() {
  stopCommunityRealtime();
  if (!hasCommunityAccess.value || typeof EventSource === "undefined") {
    startRealtimeFallback();
    return;
  }

  const eventSource = createCommunityEventSource();
  communityEventSource = eventSource;
  eventSource.onopen = () => {
    realtimeConnected = true;
    stopRealtimeFallback();
  };
  eventSource.addEventListener("ready", () => {
    realtimeConnected = true;
    stopRealtimeFallback();
    scheduleRealtimeSync();
  });
  eventSource.addEventListener("community.changed", (rawEvent) => {
    if (selectedTopic.value && rawEvent instanceof MessageEvent) {
      try {
        const event = JSON.parse(rawEvent.data) as { topicId?: string | null };
        if (event.topicId && event.topicId !== selectedTopic.value.id) {
          return;
        }
      } catch {
        // A malformed invalidation still triggers a safe full synchronization.
      }
    }
    scheduleRealtimeSync();
  });
  eventSource.onerror = () => {
    realtimeConnected = false;
    startRealtimeFallback();
  };
}

function handleCommunityVisibilityChange() {
  if (document.visibilityState === "visible") {
    scheduleRealtimeSync();
  }
}

async function openTopic(topic: ClubTopic) {
  if (!hasCommunityAccess.value) {
    return;
  }

  selectedTopic.value = topic;
  messages.value = [];
  messagesNextCursor.value = null;
  messagePageInitialized.value = false;
  hasLoadedOlderMessages.value = false;
  activeModerationMessageId.value = null;
  composerResetVersion.value += 1;
  interactionResetVersion.value += 1;
  clearCommunityError();
  newMessage.value = loadDraft(topic.id);
  await refreshSelectedTopic({ keepScroll: false });
  if ((mutedUntil.value || mutedPermanently.value) && !muteAlertShown.value) {
    muteAlertShown.value = true;
    showMuteAlert();
  }
}

async function createTopic() {
  if (!newTopicTitle.value.trim()) {
    return;
  }

  topicSaving.value = true;
  clearCommunityError();
  try {
    const response = await createCommunityTopic({
      title: newTopicTitle.value,
      description: null,
      isAdminOnly: newTopicAdminOnly.value
    });
    topics.value = [response.topic, ...topics.value];
    newTopicTitle.value = "";
    newTopicAdminOnly.value = false;
    showCreateTopic.value = false;
  } catch {
    showCommunityError("Не удалось создать тему.");
  } finally {
    topicSaving.value = false;
  }
}

async function restoreTopic(topic: ClubTopic) {
  const response = await updateClubTopicSettings(topic.id, { isPublished: true });
  topics.value = topics.value.map((item) => (item.id === topic.id ? response.topic : item));
}

async function handleToggleTopicLock() {
  if (!selectedTopic.value) {
    return;
  }

  const nextLocked = !selectedTopic.value.isLocked;
  const response = await updateClubTopicSettings(selectedTopic.value.id, { isLocked: nextLocked });
  selectedTopic.value = response.topic;
  topics.value = topics.value.map((topic) => (topic.id === response.topic.id ? response.topic : topic));
}

function handleDeleteTopicMessages() {
  if (!selectedTopic.value) {
    return;
  }

  showDeleteTopicMessagesConfirm.value = true;
}

function cancelDeleteTopicMessages() {
  if (deleteTopicMessagesBusy.value) {
    return;
  }

  showDeleteTopicMessagesConfirm.value = false;
}

async function confirmDeleteTopicMessages() {
  if (!selectedTopic.value || deleteTopicMessagesBusy.value) {
    return;
  }

  deleteTopicMessagesBusy.value = true;
  clearCommunityError();
  try {
    await deleteTopicMessages(selectedTopic.value.id);
    activeModerationMessageId.value = null;
    interactionResetVersion.value += 1;
    await refreshSelectedTopic({ keepScroll: false });
    await loadTopics();
  } catch {
    showCommunityError("Не удалось удалить сообщения чата.");
  } finally {
    deleteTopicMessagesBusy.value = false;
    showDeleteTopicMessagesConfirm.value = false;
  }
}

async function handleDeleteAuthorMessages(message: ClubMessage) {
  if (!selectedTopic.value) {
    return;
  }

  const confirmed = await appDialogs.confirm({
    title: `Удалить сообщения ${authorName(message)}?`,
    description: "Все сообщения этого пользователя в текущем чате будут удалены без восстановления.",
    confirmLabel: "Удалить сообщения",
    tone: "danger"
  });
  if (!confirmed) {
    activeModerationMessageId.value = null;
    return;
  }

  await deleteTopicAuthorMessages(selectedTopic.value.id, message.author.telegramId);
  activeModerationMessageId.value = null;
  interactionResetVersion.value += 1;
  await refreshSelectedTopic({ keepScroll: true });
  await loadTopics();
}

async function handleSendMessage(body: string) {
  if (!selectedTopic.value || !body.trim()) {
    return;
  }

  messageSaving.value = true;
  clearCommunityError();
  const topicId = selectedTopic.value.id;
  try {
    const result = await queueTextMessage<ClubMessage>({
      topicId,
      body,
      replyToMessageId: replyToMessage.value?.id ?? null
    });
    if (result.delivered || result.retryable) {
      newMessage.value = "";
      saveDraft(topicId, "");
      replyToMessage.value = null;
    }
    if (!result.delivered && result.retryable) {
      showCommunityError("Сообщение сохранено и будет отправлено при восстановлении связи.");
    } else if (!result.delivered) {
      newMessage.value = body;
      saveDraft(topicId, body);
      const data =
        typeof result.error === "object" && result.error && "data" in result.error
          ? (result.error.data as { mutedUntil?: string | null; mutedPermanently?: boolean } | undefined)
          : undefined;
      if (data?.mutedUntil || data?.mutedPermanently) {
        mutedUntil.value = data.mutedUntil ?? null;
        mutedPermanently.value = Boolean(data.mutedPermanently);
        showMuteAlert();
      }
      showCommunityError("Не удалось отправить сообщение.");
    }
  } catch {
    newMessage.value = body;
    saveDraft(topicId, body);
    showCommunityError("Не удалось подготовить сообщение к отправке.");
  } finally {
    messageSaving.value = false;
  }
}

function handleDraftChange(text: string) {
  newMessage.value = text;
  if (selectedTopic.value) saveDraft(selectedTopic.value.id, text);
}

function handleCommunityOnline() {
  void flushQueuedMessages();
}

function appendCreatedMessage(message: ClubMessage) {
  messages.value = [message, ...messages.value];
  if (selectedTopic.value) {
    selectedTopic.value = { ...selectedTopic.value, messagesCount: selectedTopic.value.messagesCount + 1 };
    topics.value = topics.value.map((topic) => (topic.id === selectedTopic.value?.id ? selectedTopic.value : topic));
  }
  void scrollToBottom();
}

async function handleSendImages(files: File[]) {
  if (!selectedTopic.value || !files.length) return;
  messageSaving.value = true;
  try {
    const response = await createClubImageMessage(selectedTopic.value.id, files, replyToMessage.value?.id ?? null);
    replyToMessage.value = null;
    appendCreatedMessage(response.message);
    composerResetVersion.value += 1;
  } catch {
    showCommunityError("Не удалось отправить изображения. Можно повторить отправку.");
  } finally {
    messageSaving.value = false;
  }
}

async function handleSendVoice(blob: Blob, durationSeconds: number) {
  if (!selectedTopic.value) return;
  messageSaving.value = true;
  try {
    const response = await createClubVoiceMessage(selectedTopic.value.id, blob, durationSeconds, replyToMessage.value?.id ?? null);
    replyToMessage.value = null;
    appendCreatedMessage(response.message);
    composerResetVersion.value += 1;
  } catch {
    showCommunityError("Не удалось отправить голосовое. Запись сохранена для повторной отправки.");
  } finally {
    messageSaving.value = false;
  }
}

async function handleCreatePoll(payload: ChatPollDraft) {
  if (!selectedTopic.value) return;
  messageSaving.value = true;
  try {
    const response = await createClubPoll(selectedTopic.value.id, { ...payload, replyToMessageId: replyToMessage.value?.id ?? null });
    replyToMessage.value = null;
    appendCreatedMessage(response.message);
    composerResetVersion.value += 1;
  } catch {
    showCommunityError("Не удалось создать опрос.");
  } finally {
    messageSaving.value = false;
  }
}

async function handlePollVote(message: ClubMessage, optionIds: string[]) {
  if (!message.poll) return;
  try {
    const response = await voteInClubPoll(message.poll.id, optionIds);
    messages.value = messages.value.map((item) => (item.id === response.message.id ? response.message : item));
  } catch {
    showCommunityError("Не удалось сохранить голос.");
    await refreshSelectedTopic({ keepScroll: true });
  }
}

async function handleClosePoll(message: ClubMessage) {
  if (!message.poll) return;
  try {
    const response = await closeClubPoll(message.poll.id);
    messages.value = messages.value.map((item) => (item.id === response.message.id ? response.message : item));
  } catch {
    showCommunityError("Не удалось завершить опрос.");
  }
}

async function handleMessageStatus(message: ClubMessage, status: "visible" | "hidden" | "deleted") {
  await updateModerationStatus("chat_message", message.id, status);
  messages.value = messages.value.map((item) => (item.id === message.id ? { ...item, status } : item));
  activeModerationMessageId.value = null;
}

async function handleMute(message: ClubMessage) {
  if (!selectedTopic.value) {
    return;
  }
  if (message.authorMute) {
    showCommunityError("У клиента уже есть активный мут.");
    activeModerationMessageId.value = null;
    return;
  }

  try {
    const response = await createTopicUserMute(selectedTopic.value.id, {
      telegramId: message.author.telegramId,
      kind: "permanent",
      reason: "Модерация сообщения в чате",
      expiresAt: null
    });
    messages.value = [response.message, ...messages.value];
    activeModerationMessageId.value = null;
    await openTopic(selectedTopic.value);
    await scrollToBottom();
  } catch (reason) {
    showCommunityError(getErrorStatus(reason) === 409 ? "У клиента уже есть активный мут." : "Не удалось выдать мут.");
  }
}

async function handleRevokeMute(message: ClubMessage) {
  if (!selectedTopic.value || !message.authorMute) {
    return;
  }

  await revokeTopicUserMute(selectedTopic.value.id, message.authorMute.id);
  activeModerationMessageId.value = null;
  await openTopic(selectedTopic.value);
}

async function handleReaction(message: ClubMessage, reaction: VisibleMessageReaction) {
  const nextReaction = message.myReaction === reaction ? null : reaction;
  const response = await reactToClubMessage(message.id, nextReaction);
  messages.value = messages.value.map((item) => (item.id === message.id ? response.message : item));
  reactionCompletedVersion.value += 1;
}

onMounted(() => {
  document.addEventListener("visibilitychange", handleCommunityVisibilityChange);
  window.addEventListener("online", handleCommunityOnline);
  void flushQueuedMessages();
  if (hasCommunityAccess.value) {
    void loadTopics({ showLoading: true });
    startCommunityRealtime();
  }
});

watch(
  () => Boolean(selectedTopic.value),
  (isOpen) => {
    emit("chatOpenChange", isOpen);
    if (isOpen) {
      if (realtimeConnected) {
        stopRealtimeFallback();
      } else {
        startRealtimeFallback();
      }
      return;
    }

    void topicState.closeTopic();
    if (!realtimeConnected) {
      startRealtimeFallback();
    }
    activeModerationMessageId.value = null;
    composerResetVersion.value += 1;
    void loadTopics();
  },
  { immediate: true }
);

watch(
  () => session.user?.id ?? null,
  (userId, previousUserId) => {
    if (previousUserId !== userId) topicState.reset();
    if (!userId) {
      resetCommunityDrafts();
      resetCommunityOutbox();
      queuedTextMessages.value = [];
      return;
    }
    if (previousUserId && previousUserId !== userId) {
      selectedTopic.value = null;
      messages.value = [];
      newMessage.value = "";
    }
    configurePersistedCommunityState(userId);
    void flushQueuedMessages();
  },
  { immediate: true }
);

watch(
  hasCommunityAccess,
  (hasAccess) => {
    if (!hasAccess) {
      selectedTopic.value = null;
      topics.value = [];
      messages.value = [];
      messagesNextCursor.value = null;
      messagePageInitialized.value = false;
      hasLoadedOlderMessages.value = false;
      clearCommunityError();
      stopCommunityRealtime();
      stopRealtimeFallback();
      return;
    }

    void loadTopics({ showLoading: true });
    startCommunityRealtime();
  }
);

onBeforeUnmount(() => {
  void topicState.closeTopic();
  topicState.dispose();
  stopCommunityRealtime();
  stopRealtimeFallback();
  document.removeEventListener("visibilitychange", handleCommunityVisibilityChange);
  window.removeEventListener("online", handleCommunityOnline);
  emit("chatOpenChange", false);
});
</script>

<template>
  <section class="community-chat-shell ui-page-section">
    <div v-if="!selectedTopic" class="community-section-content">
      <UiPageHeader :title="t('communitySectionTitle')" :subtitle="t('communitySectionSubtitle')">
        <template #actions>
          <div class="community-topline-actions">
            <button
              v-if="isModerator"
              class="icon-button ui-icon-button"
              type="button"
              aria-label="Добавить тему"
              @click="showCreateTopic = !showCreateTopic"
            >
              <Plus class="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </template>
      </UiPageHeader>

      <div v-if="!hasCommunityAccess" class="access-lock-card">
        <strong>Общение закрыто</strong>
        <span>Раздел доступен после активации подписки.</span>
      </div>

      <form v-if="hasCommunityAccess && isModerator && showCreateTopic" class="chat-create-form" @submit.prevent="createTopic">
        <input v-model.trim="newTopicTitle" class="text-input" placeholder="Название темы" />
        <label class="chat-topic-visibility-toggle">
          <input v-model="newTopicAdminOnly" type="checkbox" />
          <span class="chat-topic-visibility-icon">
            <Lock class="h-4 w-4" aria-hidden="true" />
          </span>
          <span>
            <strong>{{ t("communityAdminOnlyToggle") }}</strong>
            <small>{{ t("communityAdminOnlyHint") }}</small>
          </span>
        </label>
        <button class="primary-button ui-button" type="submit" :disabled="topicSaving">
          {{ topicSaving ? t("loading") : t("create") }}
        </button>
      </form>

      <p v-if="communityError" class="text-xs text-[var(--danger)]">{{ communityError }}</p>

      <div v-if="hasCommunityAccess && !activeTopics.length && !archivedTopics.length && !loading" class="surface-card ui-card text-sm text-[var(--muted)]">
        {{ t("communityEmpty") }}
      </div>

      <ChatTopicList
        v-if="hasCommunityAccess"
        :active-topics="activeTopics"
        :archived-topics="archivedTopics"
        :is-moderator="isModerator"
        :has-new-reply-to-me="hasNewReplyToMe"
        @open-topic="openTopic"
        @restore-topic="restoreTopic"
      />
    </div>

    <ChatRoom
      v-else
      ref="chatRoom"
      :topic="selectedTopic"
      :messages="messages"
      :messages-next-cursor="messagesNextCursor"
      :loading-older-messages="loadingOlderMessages"
      :message-saving="messageSaving"
      :community-error="communityError"
      :is-moderator="isModerator"
      :viewer="session.user"
      :can-write="Boolean(canWrite)"
      :is-muted="isMuted"
      :mute-composer-text="muteComposerText"
      :unavailable-composer-text="unavailableComposerText"
      :reply-to-message="replyToMessage"
      :draft="newMessage"
      :composer-reset-version="composerResetVersion"
      :reaction-completed-version="reactionCompletedVersion"
      :interaction-reset-version="interactionResetVersion"
      :active-moderation-message="activeModerationMessage"
      @back="selectedTopic = null"
      @toggle-topic-lock="handleToggleTopicLock"
      @delete-topic-messages="handleDeleteTopicMessages"
      @load-older-messages="loadOlderMessages"
      @reply="startReply"
      @react="handleReaction"
      @open-actions="activeModerationMessageId = $event.id"
      @poll-vote="handlePollVote"
      @poll-close="handleClosePoll"
      @send-text="handleSendMessage"
      @send-voice="handleSendVoice"
      @send-files="handleSendImages"
      @create-poll="handleCreatePoll"
      @draft-change="handleDraftChange"
      @cancel-reply="replyToMessage = null"
      @close-actions="closeModerationSheet"
      @toggle-pin="handleTogglePin"
      @toggle-status="handleMessageStatus"
      @mute="handleMute"
      @revoke-mute="handleRevokeMute"
      @delete-author-messages="handleDeleteAuthorMessages"
    />
    <ConfirmDialog
      :open="showDeleteTopicMessagesConfirm"
      title="Удалить все сообщения?"
      :description="
        isOwner
          ? 'Все сообщения в этом чате будут удалены сразу и без восстановления.'
          : 'Клиенты больше не будут видеть сообщения. Окончательная очистка произойдёт через 24 часа.'
      "
      confirm-label="Удалить всё"
      cancel-label="Отмена"
      :danger="true"
      :busy="deleteTopicMessagesBusy"
      @cancel="cancelDeleteTopicMessages"
      @confirm="confirmDeleteTopicMessages"
    />
  </section>
</template>
