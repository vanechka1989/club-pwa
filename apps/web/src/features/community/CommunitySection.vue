<script setup lang="ts">
import type { ClubMessage, ClubTopic, MessageReaction } from "@club/shared";
import { ArrowLeft, MessageCircle, Plus, Send, Smile, Trash2, X } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  createClubMessage,
  createCommunityTopic,
  createTopicUserMute,
  getClubMessages,
  getCommunityTopics,
  reactToClubMessage,
  revokeTopicUserMute,
  updateClubTopicSettings,
  updateModerationStatus
} from "@/api/client";
import { useI18n } from "@/features/app/i18n";
import { useSessionStore } from "@/stores/session";

const { t } = useI18n();
const session = useSessionStore();

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
const replyToMessage = ref<ClubMessage | null>(null);
const activeModerationMessageId = ref<string | null>(null);
const pointerStartX = ref<number | null>(null);
const pointerStartY = ref<number | null>(null);
const messageSaving = ref(false);
const topicSaving = ref(false);
const communityError = ref<string | null>(null);
const messagesEnd = ref<HTMLElement | null>(null);
const messagesList = ref<HTMLElement | null>(null);
const muteAlertShown = ref(false);
const topicReadAt = ref<Record<string, string>>({});
let refreshTimer: ReturnType<typeof globalThis.setInterval> | null = null;
let topicsRefreshTimer: ReturnType<typeof globalThis.setInterval> | null = null;
let refreshInFlight = false;
let topicsRefreshInFlight = false;
const topicReadStorageKey = "club-community-topic-read-at";

const isModerator = computed(() => session.user?.role === "admin" || session.user?.role === "owner");
const hasCommunityAccess = computed(() => isModerator.value || session.user?.membershipStatus === "active");
const isMuted = computed(() => mutedPermanently.value || Boolean(mutedUntil.value));
const orderedMessages = computed(() => [...messages.value].reverse());
const activeTopics = computed(() => topics.value.filter((topic) => topic.isPublished));
const archivedTopics = computed(() => topics.value.filter((topic) => !topic.isPublished && topic.archivedUntil));
const canWrite = computed(
  () => hasCommunityAccess.value && selectedTopic.value && !selectedTopic.value.isLocked && selectedTopic.value.isPublished && !isMuted.value
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
const quickEmoji = ["👍", "🔥", "❤️", "😂", "👏"];
const reactionOptions: Array<{ value: Exclude<MessageReaction, "like" | "dislike">; label: string }> = [
  { value: "thumbs_up", label: "👍" },
  { value: "fire", label: "🔥" },
  { value: "heart", label: "❤️" },
  { value: "laugh", label: "😂" },
  { value: "clap", label: "👏" }
];

function authorName(message: ClubMessage) {
  return message.author.firstName || message.author.username || `ID ${message.author.telegramId}`;
}

function authorInitial(message: ClubMessage) {
  return authorName(message).slice(0, 1).toUpperCase();
}

function reactionLabel(reaction: MessageReaction) {
  return reactionOptions.find((option) => option.value === reaction)?.label ?? "";
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatArchiveUntil(value: string | null) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "";
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
  if (typeof reason === "object" && reason && "status" in reason && typeof reason.status === "number") {
    return reason.status;
  }

  return null;
}

function showMuteAlert() {
  const message = mutedPermanently.value
    ? "На вас наложен бессрочный мут. Вы пока не можете писать в чат."
    : `На вас наложен мут до ${mutedUntil.value ? new Date(mutedUntil.value).toLocaleString("ru-RU") : ""}. Вы пока не можете писать в чат.`;

  if (window.Telegram?.WebApp?.showAlert) {
    window.Telegram.WebApp.showAlert(message);
    return;
  }

  window.alert(message);
}

function appendEmoji(emoji: string) {
  newMessage.value = `${newMessage.value}${emoji}`;
}

function startReply(message: ClubMessage) {
  replyToMessage.value = message;
  newMessage.value = newMessage.value || "";
}

function handlePointerDown(event: PointerEvent) {
  pointerStartX.value = event.clientX;
  pointerStartY.value = event.clientY;
}

function handlePointerUp(event: PointerEvent, message: ClubMessage) {
  if (pointerStartX.value === null || pointerStartY.value === null) {
    return;
  }

  const deltaX = event.clientX - pointerStartX.value;
  const deltaY = Math.abs(event.clientY - pointerStartY.value);
  pointerStartX.value = null;
  pointerStartY.value = null;

  if (deltaX > 54 && deltaY < 40) {
    startReply(message);
  }
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
    message.createdAt,
    message.likesCount,
    message.dislikesCount,
    message.reactionCounts.map((reaction) => `${reaction.reaction}:${reaction.count}`).join(","),
    message.myReaction ?? "",
    message.authorMute?.id ?? "",
    message.authorMute?.kind ?? "",
    message.authorMute?.expiresAt ?? "",
    message.replyTo?.id ?? "",
    message.replyTo?.body ?? ""
  ].join("\u001f");
}

function messagesSignature(nextMessages: ClubMessage[]) {
  return nextMessages.map(messageSignature).join("\u001e");
}

async function refreshSelectedTopic({ keepScroll = true } = {}) {
  if (!hasCommunityAccess.value || !selectedTopic.value || refreshInFlight) {
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
    communityError.value = "Не удалось обновить чат.";
  } finally {
    refreshInFlight = false;
  }
}

function stopMessageRefresh() {
  if (refreshTimer) {
    globalThis.clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function startMessageRefresh() {
  stopMessageRefresh();
  refreshTimer = globalThis.setInterval(() => {
    if (document.visibilityState === "visible") {
      void refreshSelectedTopic();
    }
  }, 2000);
}

async function loadTopics({ showLoading = false } = {}) {
  if (!hasCommunityAccess.value || topicsRefreshInFlight) {
    return;
  }

  topicsRefreshInFlight = true;
  loading.value = showLoading;
  communityError.value = null;
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
      communityError.value = null;
      return;
    }

    communityError.value = "Не удалось загрузить общение.";
  } finally {
    loading.value = false;
    topicsRefreshInFlight = false;
  }
}

function stopTopicsRefresh() {
  if (topicsRefreshTimer) {
    globalThis.clearInterval(topicsRefreshTimer);
    topicsRefreshTimer = null;
  }
}

function startTopicsRefresh() {
  stopTopicsRefresh();
  topicsRefreshTimer = globalThis.setInterval(() => {
    if (document.visibilityState === "visible" && !selectedTopic.value) {
      void loadTopics();
    }
  }, 5000);
}

async function openTopic(topic: ClubTopic) {
  if (!hasCommunityAccess.value) {
    return;
  }

  selectedTopic.value = topic;
  communityError.value = null;
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
  communityError.value = null;
  try {
    const response = await createCommunityTopic({
      title: newTopicTitle.value,
      description: null
    });
    topics.value = [response.topic, ...topics.value];
    newTopicTitle.value = "";
    showCreateTopic.value = false;
  } catch {
    communityError.value = "Не удалось создать тему.";
  } finally {
    topicSaving.value = false;
  }
}

async function restoreTopic(topic: ClubTopic) {
  const response = await updateClubTopicSettings(topic.id, { isPublished: true });
  topics.value = topics.value.map((item) => (item.id === topic.id ? response.topic : item));
}

async function handleSendMessage() {
  if (!selectedTopic.value || !newMessage.value.trim()) {
    return;
  }

  messageSaving.value = true;
  communityError.value = null;
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
    communityError.value = "Не удалось отправить сообщение.";
  } finally {
    messageSaving.value = false;
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
}

onMounted(() => {
  loadTopicReadState();
  if (hasCommunityAccess.value) {
    void loadTopics({ showLoading: true });
  }
});

watch(
  () => Boolean(selectedTopic.value),
  (isOpen) => {
    emit("chatOpenChange", isOpen);
    if (isOpen) {
      stopTopicsRefresh();
      startMessageRefresh();
      return;
    }

    stopMessageRefresh();
    startTopicsRefresh();
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
      communityError.value = null;
      stopMessageRefresh();
      stopTopicsRefresh();
      return;
    }

    void loadTopics({ showLoading: true });
  }
);

onBeforeUnmount(() => {
  stopMessageRefresh();
  stopTopicsRefresh();
  emit("chatOpenChange", false);
});
</script>

<template>
  <section class="community-chat-shell">
    <div v-if="!selectedTopic" class="space-y-3">
      <div class="section-head">
        <div>
          <h2 class="section-title">Общение</h2>
          <p class="section-subtitle">Темы клуба и живые обсуждения.</p>
        </div>
        <div class="community-topline-actions">
          <button
            v-if="isModerator"
            class="icon-button"
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
        <button class="primary-button" type="submit" :disabled="topicSaving">
          {{ topicSaving ? t("loading") : t("create") }}
        </button>
      </form>

      <p v-if="communityError" class="text-xs text-[var(--danger)]">{{ communityError }}</p>

      <div v-if="hasCommunityAccess && !activeTopics.length && !archivedTopics.length && !loading" class="surface-card text-sm text-[var(--muted)]">
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
            <span class="chat-topic-meta">В архиве до {{ formatArchiveUntil(topic.archivedUntil) }}</span>
          </span>
          <button class="mini-action" type="button" @click="restoreTopic(topic)">Вернуть</button>
        </article>
      </div>
    </div>

    <div v-else class="chat-room">
      <header class="chat-room-header">
        <button class="icon-button" type="button" aria-label="Назад" @click="selectedTopic = null">
          <ArrowLeft class="h-4 w-4" aria-hidden="true" />
        </button>
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-sm font-semibold text-[var(--text)]">{{ selectedTopic.title }}</h2>
          <p class="text-xs text-[var(--muted)]">
            {{ selectedTopic.isLocked ? "Тема закрыта" : "Открытый чат" }}
          </p>
        </div>
      </header>

      <div class="chat-room-notices">
        <p v-if="communityError" class="px-1 text-xs text-[var(--danger)]">{{ communityError }}</p>
      </div>

      <div ref="messagesList" class="chat-messages">
        <p v-if="!messages.length" class="py-6 text-center text-xs text-[var(--muted)]">{{ t("messagesEmpty") }}</p>
        <article
          v-for="message in orderedMessages"
          :key="message.id"
          class="chat-message"
          :class="{
            'opacity-55': message.status !== 'visible',
            'chat-message-system': message.isSystem,
            'chat-message-own': !message.isSystem && isOwnMessage(message),
            'chat-message-reply-to-me': !message.isSystem && isReplyToMe(message)
          }"
          @pointerdown="handlePointerDown"
          @pointerup="handlePointerUp($event, message)"
        >
          <div v-if="!message.isSystem && !isOwnMessage(message)" class="chat-avatar">
            <img v-if="message.author.photoUrl" :src="message.author.photoUrl" :alt="authorName(message)" />
            <span v-else>{{ authorInitial(message) }}</span>
          </div>
          <div v-if="!message.isSystem" class="chat-bubble">
            <div class="chat-message-head">
              <button
                v-if="isModerator"
                class="chat-message-author"
                type="button"
                @click.stop="activeModerationMessageId = activeModerationMessageId === message.id ? null : message.id"
              >
                {{ authorName(message) }}
              </button>
              <span v-else class="chat-message-author">{{ authorName(message) }}</span>
              <span v-if="isModerator && message.authorMute" class="mute-inline-badge">Мут</span>
              <span>{{ formatMessageTime(message.createdAt) }}</span>
            </div>
            <div v-if="message.replyTo" class="reply-preview">
              <span>{{ message.replyTo.author.firstName || message.replyTo.author.username || `ID ${message.replyTo.author.telegramId}` }}</span>
              <span>{{ message.replyTo.body }}</span>
            </div>
            <p class="chat-message-body">{{ message.body }}</p>
            <p v-if="message.status !== 'visible'" class="mt-1 text-[0.68rem] text-[var(--danger)]">
              {{ message.status === "deleted" ? "Удалено" : "Скрыто" }}
            </p>
            <div class="message-reactions">
              <button
                v-for="option in reactionOptions"
                :key="option.value"
                class="message-reaction-button"
                :class="{ 'message-reaction-active': message.myReaction === option.value }"
                type="button"
                @click="handleReaction(message, option.value)"
              >
                <span>{{ option.label }}</span>
                <small v-if="message.reactionCounts.find((item) => item.reaction === option.value)?.count">
                  {{ message.reactionCounts.find((item) => item.reaction === option.value)?.count }}
                </small>
              </button>
            </div>
            <div v-if="isModerator && activeModerationMessageId === message.id" class="moderation-menu">
              <div v-if="message.authorMute" class="moderation-status">
                <span>{{ formatMuteLabel(message) }}</span>
                <button class="mini-action" type="button" @click="handleRevokeMute(message)">Снять мут</button>
              </div>
              <button class="mini-action" type="button" @click="handleMessageStatus(message, message.status === 'visible' ? 'deleted' : 'visible')">
                {{ message.status === "visible" ? "Удалить" : "Вернуть" }}
              </button>
              <button class="mini-action" type="button" @click="handleMute(message)">
                Мут пока не снимут
              </button>
            </div>
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
        <div class="emoji-row">
          <Smile class="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
          <button v-for="emoji in quickEmoji" :key="emoji" type="button" @click="appendEmoji(emoji)">
            {{ emoji }}
          </button>
        </div>
        <div class="chat-input-row">
          <div v-if="isMuted" class="mute-compose-notice">{{ muteComposerText }}</div>
          <input
            v-else
            v-model.trim="newMessage"
            class="text-input"
            :placeholder="t('messagePlaceholder')"
            :disabled="!canWrite || messageSaving"
          />
          <button class="icon-button" type="submit" aria-label="Отправить" :disabled="!canWrite || messageSaving || isMuted">
            <Send class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  </section>
</template>
