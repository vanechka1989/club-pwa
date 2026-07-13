<script setup lang="ts">
import { resolveDisplayName, type ClubMessage, type ClubTopic, type MessageReaction } from "@club/shared";
import { ArrowLeft, Ban, BarChart3, Camera, Image as ImageIcon, LoaderCircle, MessageCircle, Mic, MoreVertical, Paperclip, Pin, PinOff, Plus, RotateCcw, Send, Smile, Square, Trash2, UserX, X } from "lucide-vue-next";
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
  reactToClubMessage,
  setClubMessagePinned,
  revokeTopicUserMute,
  updateClubTopicSettings,
  updateModerationStatus
} from "@/api/client";
import { formatArchiveDeletionLabel } from "@/features/app/archiveCountdown";
import ConfirmDialog from "@/features/app/ConfirmDialog.vue";
import { useI18n } from "@/features/app/i18n";
import { useNotificationsStore } from "@/stores/notifications";
import { useSessionStore } from "@/stores/session";
import { hasAdminCapability } from "@/features/admin/adminCapabilities";
import ChatVoiceMessage from "./ChatVoiceMessage.vue";
import ChatImageGallery from "./ChatImageGallery.vue";
import ChatPollComposer from "./ChatPollComposer.vue";
import ChatPollMessage from "./ChatPollMessage.vue";
import { useVoiceRecorder } from "./useVoiceRecorder";
import { useImageDraft } from "./useImageDraft";

const { t } = useI18n();
const session = useSessionStore();
const notifications = useNotificationsStore();

const emit = defineEmits<{
  chatOpenChange: [isOpen: boolean];
}>();

const topics = ref<ClubTopic[]>([]);
const messages = ref<ClubMessage[]>([]);
const selectedTopic = ref<ClubTopic | null>(null);
const loading = ref(false);
const mutedUntil = ref<string | null>(null);
const mutedPermanently = ref(false);
const newMessage = ref("");
const newTopicTitle = ref("");
const showCreateTopic = ref(false);
const showTopicAdminMenu = ref(false);
const showEmojiPicker = ref(false);
const showPinnedMessages = ref(false);
const replyToMessage = ref<ClubMessage | null>(null);
const activeModerationMessageId = ref<string | null>(null);
const activeReactionMessageId = ref<string | null>(null);
const pointerStartX = ref<number | null>(null);
const pointerStartY = ref<number | null>(null);
const activeSwipeMessageId = ref<string | null>(null);
const highlightedMessageId = ref<string | null>(null);
const swipeOffset = ref(0);
const suppressNextMessageClick = ref(false);
const messageSaving = ref(false);
const topicSaving = ref(false);
const communityError = ref<string | null>(null);
const showAttachmentMenu = ref(false);
const showPollComposer = ref(false);
const showDeleteTopicMessagesConfirm = ref(false);
const deleteTopicMessagesBusy = ref(false);
const imageInput = ref<HTMLInputElement | null>(null);
const cameraInput = ref<HTMLInputElement | null>(null);
const messagesEnd = ref<HTMLElement | null>(null);
const messagesList = ref<HTMLElement | null>(null);
const muteAlertShown = ref(false);
const topicReadAt = ref<Record<string, string>>({});
let realtimeFallbackTimer: ReturnType<typeof globalThis.setInterval> | null = null;
let realtimeSyncTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let communityEventSource: EventSource | null = null;
let realtimeConnected = false;
let messageHighlightTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let refreshInFlight = false;
let refreshSelectedTopicQueued = false;
let topicsRefreshInFlight = false;
let lastCommunityErrorNotification: { text: string; shownAt: number } | null = null;
const topicReadStorageKey = "club-community-topic-read-at";
const voiceRecorder = useVoiceRecorder();
const imageDraft = useImageDraft();

const isModerator = computed(() =>
  hasAdminCapability(session.user?.role, session.user?.adminPermissions, "community")
);
const isOwner = computed(() => session.user?.role === "owner");
const hasCommunityAccess = computed(() => isModerator.value || session.user?.membershipStatus === "active");
const isMuted = computed(() => mutedPermanently.value || Boolean(mutedUntil.value));
const orderedMessages = computed(() => [...messages.value].reverse());
const pinnedMessages = computed(() =>
  orderedMessages.value.filter((message) => Boolean(message.pinnedAt) && message.status === "visible" && !message.isSystem)
);
const latestPinnedMessage = computed(() => pinnedMessages.value.at(-1) ?? null);
const activeModerationMessage = computed(
  () => orderedMessages.value.find((message) => message.id === activeModerationMessageId.value) ?? null
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
const quickEmoji = ["👍", "🔥", "❤️", "😂", "👏", "💩"];
const reactionOptions: Array<{ value: Exclude<MessageReaction, "like" | "dislike">; label: string }> = [
  { value: "thumbs_up", label: "👍" },
  { value: "fire", label: "🔥" },
  { value: "heart", label: "❤️" },
  { value: "laugh", label: "😂" },
  { value: "clap", label: "👏" },
  { value: "poop", label: "💩" }
];

function authorName(message: ClubMessage) {
  return resolveDisplayName(message.author);
}

function authorInitial(message: ClubMessage) {
  return authorName(message).slice(0, 1).toUpperCase();
}

function closeModerationSheet() {
  activeModerationMessageId.value = null;
}

function handleModerationSheetKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && activeModerationMessageId.value) {
    closeModerationSheet();
  }
}

function avatarImageStyle(author: ClubMessage["author"]) {
  const positionX = author.avatarPositionX ?? 50;
  const positionY = author.avatarPositionY ?? 50;
  const scale = author.avatarScale ?? 1;

  return {
    objectPosition: `${positionX}% ${positionY}%`,
    transform: `scale(${scale})`,
    transformOrigin: `${positionX}% ${positionY}%`
  };
}

function messageAuthorPhotoUrl(message: ClubMessage) {
  return isOwnMessage(message) ? (session.user?.photoUrl ?? message.author.photoUrl) : message.author.photoUrl;
}

function messageAuthorAvatarStyle(message: ClubMessage) {
  if (!isOwnMessage(message) || !session.user) {
    return avatarImageStyle(message.author);
  }

  return avatarImageStyle({
    ...message.author,
    avatarPositionX: session.user.avatarPositionX,
    avatarPositionY: session.user.avatarPositionY,
    avatarScale: session.user.avatarScale
  });
}

function reactionLabel(reaction: MessageReaction) {
  return reactionOptions.find((option) => option.value === reaction)?.label ?? "";
}

function isVisibleReaction(reaction: MessageReaction): reaction is Exclude<MessageReaction, "like" | "dislike"> {
  return reactionOptions.some((option) => option.value === reaction);
}

function visibleReactionCounts(message: ClubMessage) {
  return message.reactionCounts.filter(
    (reaction): reaction is { reaction: Exclude<MessageReaction, "like" | "dislike">; count: number } =>
      isVisibleReaction(reaction.reaction)
  );
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatMuteLabel(message: ClubMessage) {
  if (!message.authorMute) {
    return "";
  }

  if (message.authorMute.kind === "permanent") {
    return "Мут бессрочно";
  }

  return `Мут до ${message.authorMute.expiresAt ? new Date(message.authorMute.expiresAt).toLocaleString("ru-RU") : ""}`;
}

function isOwnMessage(message: ClubMessage) {
  return message.author.id === session.user?.id;
}

function isReplyToMe(message: ClubMessage) {
  return message.replyTo?.author.id === session.user?.id && !isOwnMessage(message);
}

function loadTopicReadState() {
  try {
    topicReadAt.value = JSON.parse(localStorage.getItem(topicReadStorageKey) ?? "{}") as Record<string, string>;
  } catch {
    topicReadAt.value = {};
  }
}

function markTopicRead(topicId: string) {
  topicReadAt.value = {
    ...topicReadAt.value,
    [topicId]: new Date().toISOString()
  };
  localStorage.setItem(topicReadStorageKey, JSON.stringify(topicReadAt.value));
}

function hasNewReplyToMe(topic: ClubTopic) {
  if (!topic.latestReplyToMeAt) {
    return false;
  }

  const lastReadAt = topicReadAt.value[topic.id];
  return !lastReadAt || new Date(topic.latestReplyToMeAt) > new Date(lastReadAt);
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
  window.alert(message);
}

function appendEmoji(emoji: string) {
  newMessage.value = `${newMessage.value}${emoji}`;
  showEmojiPicker.value = false;
}

function startReply(message: ClubMessage) {
  replyToMessage.value = message;
  newMessage.value = newMessage.value || "";
}

function resetSwipeTracking() {
  pointerStartX.value = null;
  pointerStartY.value = null;
  activeSwipeMessageId.value = null;
  swipeOffset.value = 0;
}

function startSwipeTracking(message: ClubMessage, clientX: number, clientY: number) {
  if (message.isSystem) {
    return;
  }

  pointerStartX.value = clientX;
  pointerStartY.value = clientY;
  activeSwipeMessageId.value = message.id;
  swipeOffset.value = 0;
}

function updateSwipeTracking(clientX: number, clientY: number, message: ClubMessage) {
  if (pointerStartX.value === null || pointerStartY.value === null || activeSwipeMessageId.value !== message.id) {
    return;
  }

  const deltaX = clientX - pointerStartX.value;
  const deltaY = Math.abs(clientY - pointerStartY.value);
  if (deltaY > 56) {
    swipeOffset.value = 0;
    return;
  }

  swipeOffset.value = Math.max(-58, Math.min(58, deltaX));
}

function finishSwipeTracking(clientX: number, clientY: number, message: ClubMessage) {
  if (pointerStartX.value === null || pointerStartY.value === null || activeSwipeMessageId.value !== message.id) {
    resetSwipeTracking();
    return false;
  }

  const deltaX = clientX - pointerStartX.value;
  const deltaY = Math.abs(clientY - pointerStartY.value);
  resetSwipeTracking();

  if (Math.abs(deltaX) > 44 && deltaY < 46) {
    startReply(message);
    activeReactionMessageId.value = null;
    suppressNextMessageClick.value = true;
    window.setTimeout(() => {
      suppressNextMessageClick.value = false;
    }, 250);
    return true;
  }

  return false;
}

function swipeStyle(message: ClubMessage) {
  return activeSwipeMessageId.value === message.id
    ? {
        transform: `translateX(${swipeOffset.value}px)`
      }
    : undefined;
}

function swipeCueSide() {
  return swipeOffset.value < 0 ? "left" : "right";
}

function handlePointerDown(event: PointerEvent, message: ClubMessage) {
  startSwipeTracking(message, event.clientX, event.clientY);
}

function handlePointerMove(event: PointerEvent, message: ClubMessage) {
  updateSwipeTracking(event.clientX, event.clientY, message);
}

function handlePointerUp(event: PointerEvent, message: ClubMessage) {
  finishSwipeTracking(event.clientX, event.clientY, message);
}

function handleTouchStart(event: TouchEvent, message: ClubMessage) {
  const touch = event.changedTouches[0];
  if (touch) {
    startSwipeTracking(message, touch.clientX, touch.clientY);
  }
}

function handleTouchMove(event: TouchEvent, message: ClubMessage) {
  const touch = event.changedTouches[0];
  if (touch) {
    updateSwipeTracking(touch.clientX, touch.clientY, message);
  }
}

function handleTouchEnd(event: TouchEvent, message: ClubMessage) {
  const touch = event.changedTouches[0];
  if (touch) {
    finishSwipeTracking(touch.clientX, touch.clientY, message);
  }
}

function openReactionPicker(message: ClubMessage) {
  if (message.isSystem || suppressNextMessageClick.value) {
    return;
  }

  activeReactionMessageId.value = activeReactionMessageId.value === message.id ? null : message.id;
}

async function scrollToBottom() {
  await nextTick();
  messagesEnd.value?.scrollIntoView({ block: "end" });
}

function isNearBottom() {
  const element = messagesList.value;
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

function scrollToMessage(messageId: string) {
  showPinnedMessages.value = false;
  highlightedMessageId.value = messageId;
  if (messageHighlightTimer) globalThis.clearTimeout(messageHighlightTimer);
  nextTick(() => document.getElementById(`chat-message-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  messageHighlightTimer = globalThis.setTimeout(() => {
    if (highlightedMessageId.value === messageId) highlightedMessageId.value = null;
    messageHighlightTimer = null;
  }, 1_800);
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
  const scrollElement = messagesList.value;
  const previousScrollTop = scrollElement?.scrollTop ?? 0;
  const previousScrollHeight = scrollElement?.scrollHeight ?? 0;
  const shouldScroll = !keepScroll || isNearBottom();
  try {
    const response = await getClubMessages(selectedTopic.value.id);
    const messagesChanged = messagesSignature(messages.value) !== messagesSignature(response.messages);
    if (messagesChanged) {
      messages.value = response.messages;
    }
    mutedUntil.value = response.mutedUntil;
    mutedPermanently.value = response.mutedPermanently;
    markTopicRead(selectedTopic.value.id);

    if (!messagesChanged) {
      return;
    }

    if (shouldScroll) {
      await scrollToBottom();
    } else if (scrollElement) {
      await nextTick();
      scrollElement.scrollTop = previousScrollTop + (scrollElement.scrollHeight - previousScrollHeight);
    }
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
  showTopicAdminMenu.value = false;
  activeModerationMessageId.value = null;
  activeReactionMessageId.value = null;
  clearCommunityError();
  await refreshSelectedTopic({ keepScroll: false });
  markTopicRead(topic.id);
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
      description: null
    });
    topics.value = [response.topic, ...topics.value];
    newTopicTitle.value = "";
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
  showTopicAdminMenu.value = false;
}

function handleDeleteTopicMessages() {
  if (!selectedTopic.value) {
    return;
  }

  showTopicAdminMenu.value = false;
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
    activeReactionMessageId.value = null;
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

  const confirmed = window.confirm(`Удалить все сообщения пользователя ${authorName(message)} в этом чате?`);
  if (!confirmed) {
    activeModerationMessageId.value = null;
    return;
  }

  await deleteTopicAuthorMessages(selectedTopic.value.id, message.author.telegramId);
  activeModerationMessageId.value = null;
  activeReactionMessageId.value = null;
  await refreshSelectedTopic({ keepScroll: true });
  await loadTopics();
}

async function handleSendMessage() {
  if (!selectedTopic.value || !newMessage.value.trim()) {
    return;
  }

  messageSaving.value = true;
  clearCommunityError();
  try {
    const response = await createClubMessage(selectedTopic.value.id, newMessage.value, replyToMessage.value?.id ?? null);
    newMessage.value = "";
    replyToMessage.value = null;
    messages.value = [response.message, ...messages.value];
    selectedTopic.value = {
      ...selectedTopic.value,
      messagesCount: selectedTopic.value.messagesCount + 1
    };
    topics.value = topics.value.map((topic) => (topic.id === selectedTopic.value?.id ? selectedTopic.value : topic));
    await scrollToBottom();
  } catch (reason) {
    const data =
      typeof reason === "object" && reason && "data" in reason
        ? (reason.data as { mutedUntil?: string | null; mutedPermanently?: boolean } | undefined)
        : undefined;
    if (data?.mutedUntil || data?.mutedPermanently) {
      mutedUntil.value = data.mutedUntil ?? null;
      mutedPermanently.value = Boolean(data.mutedPermanently);
      showMuteAlert();
    }
    showCommunityError("Не удалось отправить сообщение.");
  } finally {
    messageSaving.value = false;
  }
}

function appendCreatedMessage(message: ClubMessage) {
  messages.value = [message, ...messages.value];
  if (selectedTopic.value) {
    selectedTopic.value = { ...selectedTopic.value, messagesCount: selectedTopic.value.messagesCount + 1 };
    topics.value = topics.value.map((topic) => (topic.id === selectedTopic.value?.id ? selectedTopic.value : topic));
  }
  void scrollToBottom();
}

function handleImageSelection(event: Event) {
  const input = event.target as HTMLInputElement;
  imageDraft.add(Array.from(input.files ?? []));
  input.value = "";
  showAttachmentMenu.value = false;
}

async function handleSendImages() {
  if (!selectedTopic.value || !imageDraft.files.value.length) return;
  messageSaving.value = true;
  try {
    const response = await createClubImageMessage(selectedTopic.value.id, imageDraft.files.value, replyToMessage.value?.id ?? null);
    imageDraft.clear();
    replyToMessage.value = null;
    appendCreatedMessage(response.message);
  } catch {
    showCommunityError("Не удалось отправить изображения. Можно повторить отправку.");
  } finally {
    messageSaving.value = false;
  }
}

async function handleSendVoice() {
  if (!selectedTopic.value || !voiceRecorder.blob.value) return;
  voiceRecorder.setUploading(true);
  messageSaving.value = true;
  try {
    const response = await createClubVoiceMessage(selectedTopic.value.id, voiceRecorder.blob.value, voiceRecorder.durationSeconds.value, replyToMessage.value?.id ?? null);
    voiceRecorder.complete();
    replyToMessage.value = null;
    appendCreatedMessage(response.message);
  } catch {
    voiceRecorder.setUploading(false);
    showCommunityError("Не удалось отправить голосовое. Запись сохранена для повторной отправки.");
  } finally {
    messageSaving.value = false;
  }
}

async function handleCreatePoll(payload: { question: string; options: string[]; allowsMultiple: boolean; isAnonymous: boolean; closesAt: string | null }) {
  if (!selectedTopic.value) return;
  messageSaving.value = true;
  try {
    const response = await createClubPoll(selectedTopic.value.id, { ...payload, replyToMessageId: replyToMessage.value?.id ?? null });
    showPollComposer.value = false;
    replyToMessage.value = null;
    appendCreatedMessage(response.message);
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

async function handleReaction(message: ClubMessage, reaction: Exclude<MessageReaction, "like" | "dislike">) {
  const nextReaction = message.myReaction === reaction ? null : reaction;
  const response = await reactToClubMessage(message.id, nextReaction);
  messages.value = messages.value.map((item) => (item.id === message.id ? response.message : item));
  activeReactionMessageId.value = null;
}

onMounted(() => {
  document.addEventListener("keydown", handleModerationSheetKeydown);
  document.addEventListener("visibilitychange", handleCommunityVisibilityChange);
  loadTopicReadState();
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

    if (!realtimeConnected) {
      startRealtimeFallback();
    }
    showTopicAdminMenu.value = false;
    activeModerationMessageId.value = null;
    activeReactionMessageId.value = null;
    void loadTopics();
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
  stopCommunityRealtime();
  stopRealtimeFallback();
  document.removeEventListener("keydown", handleModerationSheetKeydown);
  document.removeEventListener("visibilitychange", handleCommunityVisibilityChange);
  if (messageHighlightTimer) globalThis.clearTimeout(messageHighlightTimer);
  emit("chatOpenChange", false);
});
</script>

<template>
  <section class="community-chat-shell ui-page-section">
    <div v-if="!selectedTopic" class="community-section-content">
      <div class="section-head ui-page-header">
        <div>
          <h2 class="section-title">{{ t("communitySectionTitle") }}</h2>
          <p class="section-subtitle">{{ t("communitySectionSubtitle") }}</p>
        </div>
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
      </div>

      <div v-if="!hasCommunityAccess" class="access-lock-card">
        <strong>Общение закрыто</strong>
        <span>Раздел доступен после активации подписки.</span>
      </div>

      <form v-if="hasCommunityAccess && isModerator && showCreateTopic" class="chat-create-form" @submit.prevent="createTopic">
        <input v-model.trim="newTopicTitle" class="text-input" placeholder="Название темы" />
        <button class="primary-button ui-button" type="submit" :disabled="topicSaving">
          {{ topicSaving ? t("loading") : t("create") }}
        </button>
      </form>

      <p v-if="communityError" class="text-xs text-[var(--danger)]">{{ communityError }}</p>

      <div v-if="hasCommunityAccess && !activeTopics.length && !archivedTopics.length && !loading" class="surface-card ui-card text-sm text-[var(--muted)]">
        {{ t("communityEmpty") }}
      </div>

      <div v-if="hasCommunityAccess" class="chat-topic-list">
        <button
          v-for="topic in activeTopics"
          :key="topic.id"
          class="chat-topic-card"
          type="button"
          @click="openTopic(topic)"
        >
          <span class="chat-topic-icon">
            <MessageCircle class="h-4 w-4" aria-hidden="true" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="chat-topic-title">{{ topic.title }}</span>
            <span class="chat-topic-meta">
              {{ topic.messagesCount }} сообщений
              <span v-if="topic.isLocked"> · закрыта</span>
            </span>
          </span>
          <span v-if="hasNewReplyToMe(topic)" class="reply-topic-badge">Вам ответили</span>
        </button>
      </div>

      <div v-if="hasCommunityAccess && isModerator && archivedTopics.length" class="chat-archive-list">
        <p class="section-eyebrow">Архив</p>
        <article v-for="topic in archivedTopics" :key="topic.id" class="chat-topic-card chat-topic-card-archived">
          <span class="chat-topic-icon">
            <Trash2 class="h-4 w-4" aria-hidden="true" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="chat-topic-title">{{ topic.title }}</span>
            <span class="chat-topic-meta">{{ formatArchiveDeletionLabel(topic.archivedUntil) }}</span>
          </span>
          <button class="mini-action" type="button" @click="restoreTopic(topic)">Вернуть</button>
        </article>
      </div>
    </div>

    <div v-else class="chat-room">
      <header class="chat-room-header">
        <button class="icon-button ui-icon-button" type="button" aria-label="Назад" @click="selectedTopic = null">
          <ArrowLeft class="h-4 w-4" aria-hidden="true" />
        </button>
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-sm font-semibold text-[var(--text)]">{{ selectedTopic.title }}</h2>
          <p class="text-xs text-[var(--muted)]">
            {{ selectedTopic.isLocked ? "Тема закрыта" : "Открытый чат" }}
          </p>
        </div>
        <div v-if="isModerator" class="chat-room-admin">
          <button
            class="icon-button ui-icon-button"
            type="button"
            aria-label="Меню чата"
            @click="showTopicAdminMenu = !showTopicAdminMenu"
          >
            <MoreVertical class="h-4 w-4" aria-hidden="true" />
          </button>
          <div v-if="showTopicAdminMenu" class="chat-admin-menu">
            <button class="mini-action" type="button" @click="handleToggleTopicLock">
              {{ selectedTopic.isLocked ? "Открыть чат" : "Закрыть чат" }}
            </button>
            <button class="mini-action danger-action" type="button" @click="handleDeleteTopicMessages">
              Удалить все сообщения
            </button>
          </div>
        </div>
      </header>

      <div class="chat-room-notices">
        <div v-if="pinnedMessages.length" class="chat-pinned-bar">
          <button v-if="latestPinnedMessage" class="chat-pinned-current" type="button" @click="showPinnedMessages = !showPinnedMessages">
            <Pin class="h-4 w-4" aria-hidden="true" />
            <span>
              <strong>Закреплено</strong>
              <small>{{ latestPinnedMessage.body }}</small>
              <time>{{ authorName(latestPinnedMessage) }} · {{ formatMessageTime(latestPinnedMessage.createdAt) }}</time>
            </span>
            <em>{{ pinnedMessages.length }}</em>
          </button>
          <div v-if="showPinnedMessages" class="chat-pinned-list">
            <button v-for="message in pinnedMessages" :key="message.id" type="button" @click="scrollToMessage(message.id)">
              <span class="chat-pinned-list-meta">
                <strong>{{ authorName(message) }}</strong>
                <time>{{ formatMessageTime(message.createdAt) }}</time>
              </span>
              <span>{{ message.body }}</span>
            </button>
          </div>
        </div>
        <p v-if="communityError" class="px-1 text-xs text-[var(--danger)]">{{ communityError }}</p>
      </div>

      <div ref="messagesList" class="chat-messages">
        <p v-if="!messages.length" class="py-6 text-center text-xs text-[var(--muted)]">{{ t("messagesEmpty") }}</p>
        <article
          v-for="message in orderedMessages"
          :key="message.id"
          :id="`chat-message-${message.id}`"
          class="chat-message"
          :class="{
            'opacity-55': message.status !== 'visible',
            'chat-message-system': message.isSystem,
            'chat-message-own': !message.isSystem && isOwnMessage(message),
            'chat-message-reply-to-me': !message.isSystem && isReplyToMe(message),
            'chat-message-swiping': activeSwipeMessageId === message.id,
            'chat-message-jump-highlight': highlightedMessageId === message.id
          }"
          :style="swipeStyle(message)"
          @pointerdown="handlePointerDown($event, message)"
          @pointermove="handlePointerMove($event, message)"
          @pointerup="handlePointerUp($event, message)"
          @pointercancel="resetSwipeTracking"
          @touchstart.passive="handleTouchStart($event, message)"
          @touchmove.passive="handleTouchMove($event, message)"
          @touchend.passive="handleTouchEnd($event, message)"
          @touchcancel.passive="resetSwipeTracking"
          @click="openReactionPicker(message)"
        >
          <span
            v-if="!message.isSystem && activeSwipeMessageId === message.id && Math.abs(swipeOffset) > 10"
            class="swipe-reply-cue"
            :class="`swipe-reply-cue-${swipeCueSide()}`"
          >
            ↩
          </span>
          <div v-if="!message.isSystem && !isOwnMessage(message)" class="chat-avatar">
            <img
              v-if="messageAuthorPhotoUrl(message)"
              :src="messageAuthorPhotoUrl(message) ?? ''"
              :alt="authorName(message)"
              :style="messageAuthorAvatarStyle(message)"
            />
            <span v-else>{{ authorInitial(message) }}</span>
          </div>
          <div v-if="!message.isSystem" class="chat-bubble">
            <div class="chat-message-head">
              <span class="chat-message-author">{{ authorName(message) }}</span>
              <span v-if="isModerator && message.authorMute" class="mute-inline-badge">Мут</span>
              <time>{{ formatMessageTime(message.createdAt) }}</time>
              <button
                v-if="isModerator"
                class="chat-message-moderation-trigger"
                type="button"
                :aria-label="`Действия с сообщением пользователя ${authorName(message)}`"
                @click.stop="activeModerationMessageId = message.id"
              >
                <MoreVertical class="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div v-if="message.replyTo" class="reply-preview">
              <span>{{ resolveDisplayName(message.replyTo.author) }}</span>
              <span>{{ message.replyTo.body }}</span>
            </div>
            <p v-if="message.kind === 'text'" class="chat-message-body">{{ message.body }}</p>
            <ChatVoiceMessage v-else-if="message.kind === 'voice' && message.voice" :voice="message.voice" />
            <ChatImageGallery v-else-if="message.kind === 'images'" :images="message.images" />
            <ChatPollMessage
              v-else-if="message.kind === 'poll' && message.poll"
              :poll="message.poll"
              :moderator="isModerator"
              :disabled="messageSaving"
              @vote="handlePollVote(message, $event)"
              @close="handleClosePoll(message)"
            />
            <span v-if="message.pinnedAt" class="chat-message-pinned"><Pin class="h-3 w-3" aria-hidden="true" /> Закреплено</span>
            <p v-if="message.status !== 'visible'" class="mt-1 text-[0.68rem] text-[var(--danger)]">
              {{ message.status === "deleted" ? "Удалено" : "Скрыто" }}
            </p>
            <div v-if="activeReactionMessageId === message.id" class="reaction-popover" @click.stop>
              <button
                v-for="option in reactionOptions"
                :key="option.value"
                class="reaction-popover-button"
                :class="{ 'message-reaction-active': message.myReaction === option.value }"
                type="button"
                @click="handleReaction(message, option.value)"
              >
                {{ option.label }}
              </button>
            </div>
            <div v-if="visibleReactionCounts(message).length" class="message-reactions">
              <button
                v-for="reaction in visibleReactionCounts(message)"
                :key="reaction.reaction"
                class="message-reaction-button"
                :class="{ 'message-reaction-active': message.myReaction === reaction.reaction }"
                type="button"
                @click.stop="handleReaction(message, reaction.reaction)"
              >
                <span>{{ reactionLabel(reaction.reaction) }}</span>
                <small>{{ reaction.count }}</small>
              </button>
            </div>
          </div>
          <div v-if="!message.isSystem && isOwnMessage(message)" class="chat-avatar">
            <img
              v-if="messageAuthorPhotoUrl(message)"
              :src="messageAuthorPhotoUrl(message) ?? ''"
              :alt="authorName(message)"
              :style="messageAuthorAvatarStyle(message)"
            />
            <span v-else>{{ authorInitial(message) }}</span>
          </div>
          <p v-if="message.isSystem" class="chat-system-body">
            <span>{{ message.body }}</span>
            <time>{{ formatMessageTime(message.createdAt) }}</time>
          </p>
        </article>
        <div ref="messagesEnd"></div>
      </div>

      <form class="chat-compose" @submit.prevent="handleSendMessage">
        <div v-if="replyToMessage" class="compose-reply">
          <div class="min-w-0">
            <p>Ответ {{ authorName(replyToMessage) }}</p>
            <span>{{ replyToMessage.body }}</span>
          </div>
          <button type="button" aria-label="Убрать ответ" @click="replyToMessage = null">
            <X class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div v-if="voiceRecorder.status.value === 'recording'" class="chat-voice-draft">
          <span class="chat-recording-dot"></span><strong>Запись {{ voiceRecorder.durationSeconds.value }} сек.</strong>
          <button type="button" @click="voiceRecorder.cancel">Отмена</button>
          <button type="button" aria-label="Остановить запись" @click="voiceRecorder.stop"><Square /></button>
        </div>
        <div v-else-if="voiceRecorder.previewUrl.value" class="chat-voice-draft">
          <audio :src="voiceRecorder.previewUrl.value" controls></audio>
          <button type="button" @click="voiceRecorder.cancel">Удалить</button>
          <button
            class="chat-draft-send"
            :class="{ 'chat-draft-send-loading': messageSaving }"
            type="button"
            :disabled="messageSaving"
            :aria-busy="messageSaving"
            @click="handleSendVoice"
          >
            <LoaderCircle v-if="messageSaving" aria-hidden="true" />
            <span>{{ messageSaving ? "Отправка…" : "Отправить" }}</span>
          </button>
        </div>
        <div v-if="imageDraft.hasImages.value" class="chat-image-draft">
          <div><button v-for="(url, index) in imageDraft.previews.value" :key="url" type="button" :aria-label="`Удалить изображение ${index + 1}`" @click="imageDraft.remove(index)"><img :src="url" alt="" /><X /></button></div>
          <button type="button" @click="imageDraft.clear">Отмена</button>
          <button
            class="chat-draft-send"
            :class="{ 'chat-draft-send-loading': messageSaving }"
            type="button"
            :disabled="messageSaving"
            :aria-busy="messageSaving"
            @click="handleSendImages"
          >
            <LoaderCircle v-if="messageSaving" aria-hidden="true" />
            <span>{{ messageSaving ? "Отправка…" : `Отправить ${imageDraft.files.value.length}` }}</span>
          </button>
        </div>
        <p v-if="voiceRecorder.error.value || imageDraft.error.value" class="chat-media-draft-error">{{ voiceRecorder.error.value || imageDraft.error.value }}</p>
        <div class="chat-input-row chat-composer-shell">
          <div class="composer-attachment-wrap">
            <button class="icon-button ui-icon-button" type="button" aria-label="Вложения" :disabled="!canWrite" @click="showAttachmentMenu = !showAttachmentMenu"><Paperclip /></button>
            <div v-if="showAttachmentMenu" class="composer-attachment-menu">
              <button type="button" @click="imageInput?.click()"><ImageIcon /> Из галереи</button>
              <button type="button" @click="cameraInput?.click()"><Camera /> Сделать фото</button>
              <button type="button" @click="showPollComposer = true; showAttachmentMenu = false"><BarChart3 /> Опрос</button>
            </div>
            <input ref="imageInput" class="sr-only" type="file" accept="image/*" multiple @change="handleImageSelection" />
            <input ref="cameraInput" class="sr-only" type="file" accept="image/*" capture="environment" @change="handleImageSelection" />
          </div>
          <div class="composer-emoji-wrap">
            <button class="icon-button ui-icon-button" type="button" aria-label="Эмодзи" @click="showEmojiPicker = !showEmojiPicker">
              <Smile class="h-4 w-4" aria-hidden="true" />
            </button>
            <div v-if="showEmojiPicker" class="composer-emoji-popover">
              <button v-for="emoji in quickEmoji" :key="emoji" type="button" @click="appendEmoji(emoji)">
                {{ emoji }}
              </button>
            </div>
          </div>
          <div v-if="isMuted" class="mute-compose-notice">{{ muteComposerText }}</div>
          <input
            v-else
            v-model.trim="newMessage"
            class="text-input"
            :placeholder="t('messagePlaceholder')"
            :disabled="!canWrite || messageSaving"
          />
          <button
            v-if="newMessage.trim()"
            class="icon-button ui-icon-button chat-composer-primary-action"
            type="submit"
            aria-label="Отправить"
            :disabled="!canWrite || messageSaving || isMuted"
          >
            <Send class="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            v-else-if="voiceRecorder.supported.value"
            class="icon-button ui-icon-button"
            type="button"
            aria-label="Записать голосовое"
            :disabled="!canWrite || messageSaving"
            @click="voiceRecorder.start"
          ><Mic /></button>
          <button v-else class="icon-button ui-icon-button" type="submit" aria-label="Отправить" disabled>
            <Send class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>
      <ChatPollComposer v-if="showPollComposer" @close="showPollComposer = false" @submit="handleCreatePoll" />
    </div>

    <Teleport to="body">
      <div
        v-if="isModerator && activeModerationMessage"
        class="moderation-action-sheet-backdrop"
        @click.self="closeModerationSheet"
      >
        <section
          class="moderation-action-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="moderation-sheet-title"
        >
          <header class="moderation-action-sheet-header">
            <div>
              <p>Действия с сообщением</p>
              <h3 id="moderation-sheet-title">{{ authorName(activeModerationMessage) }}</h3>
              <span v-if="activeModerationMessage.authorMute">{{ formatMuteLabel(activeModerationMessage) }}</span>
            </div>
            <button type="button" aria-label="Закрыть" @click="closeModerationSheet">
              <X class="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <div class="moderation-action-list">
            <button class="moderation-action-row" type="button" @click="handleTogglePin(activeModerationMessage)">
              <PinOff v-if="activeModerationMessage.pinnedAt" class="h-5 w-5" aria-hidden="true" />
              <Pin v-else class="h-5 w-5" aria-hidden="true" />
              <span>{{ activeModerationMessage.pinnedAt ? "Открепить сообщение" : "Закрепить сообщение" }}</span>
            </button>
            <button
              class="moderation-action-row"
              :class="{ 'moderation-action-danger': activeModerationMessage.status === 'visible' }"
              type="button"
              @click="handleMessageStatus(activeModerationMessage, activeModerationMessage.status === 'visible' ? 'deleted' : 'visible')"
            >
              <Trash2 v-if="activeModerationMessage.status === 'visible'" class="h-5 w-5" aria-hidden="true" />
              <RotateCcw v-else class="h-5 w-5" aria-hidden="true" />
              <span>{{ activeModerationMessage.status === "visible" ? "Удалить сообщение" : "Вернуть сообщение" }}</span>
            </button>
            <button
              v-if="activeModerationMessage.authorMute"
              class="moderation-action-row"
              type="button"
              @click="handleRevokeMute(activeModerationMessage)"
            >
              <RotateCcw class="h-5 w-5" aria-hidden="true" />
              <span>Снять ограничение</span>
            </button>
            <button
              v-else
              class="moderation-action-row"
              type="button"
              @click="handleMute(activeModerationMessage)"
            >
              <Ban class="h-5 w-5" aria-hidden="true" />
              <span>Ограничить до ручного снятия</span>
            </button>
            <button
              class="moderation-action-row moderation-action-danger"
              type="button"
              @click="handleDeleteAuthorMessages(activeModerationMessage)"
            >
              <UserX class="h-5 w-5" aria-hidden="true" />
              <span>Удалить все сообщения пользователя</span>
            </button>
          </div>

          <button class="moderation-action-cancel" type="button" @click="closeModerationSheet">Отмена</button>
        </section>
      </div>
    </Teleport>

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
